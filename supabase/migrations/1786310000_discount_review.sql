-- Post-transaction discount accountability. A >10% discount already
-- requires PRE-approval (a manager authorizes it before checkout can
-- proceed -- see 1786110000/1786180000) -- that authorization IS its own
-- approval record. A <=10% discount currently has no approval record at
-- all; it just goes through, and nothing ever asks a manager to sign off
-- on it. "All discounts must be approved by Vendor or Shop Manager"
-- closes that gap: every order with a discount now gets a review row --
-- auto-approved at checkout time for the already-pre-approved (>10%)
-- case, and queued for a first-time manager sign-off otherwise. Exactly
-- as stated: this is a percentage rule, not a dollar-value one -- a
-- small discount on an expensive sale still only needs the same
-- post-transaction sign-off as any other <=10% discount.
--
-- Deliberately its own table, NOT new columns on orders: orders already
-- has exactly one FK to users (served_by), and every bare `users(name)`
-- embed on orders throughout this codebase (fetchOrders, the Returns/
-- Voids nested embed, etc.) relies on that staying true. Adding a second
-- orders->users FK (reviewed_by) would make every one of those embeds
-- ambiguous -- the exact PostgREST 300 Multiple Choices bug just fixed
-- for invoice_payments/creditor_payments, this time hitting nearly every
-- page that lists orders. A separate table with its own single FK avoids
-- the collision entirely, same reasoning discount_authorizations already
-- follows.

CREATE TABLE IF NOT EXISTS public.order_discount_reviews (
  order_id      UUID PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'flagged')),
  reviewed_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_discount_reviews_tenant_status
  ON public.order_discount_reviews(tenant_id, status);

ALTER TABLE public.order_discount_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_discount_reviews_manager_read" ON public.order_discount_reviews;
CREATE POLICY "order_discount_reviews_manager_read"
  ON public.order_discount_reviews FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

-- RPC-only writes -- process_checkout (SECURITY DEFINER) does the initial
-- insert, review_discount below does the sign-off. No direct INSERT/
-- UPDATE policy.

-- 'flag' is the equivalent of a rejection: the sale already happened and
-- there's nothing to undo here, so this is how a reviewer marks a
-- discount for follow-up (a conversation, a write-up) instead of quietly
-- approving something that looks wrong.
CREATE OR REPLACE FUNCTION public.review_discount(
  p_order_id UUID, p_action TEXT, p_note TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to review discounts';
  END IF;
  IF p_action NOT IN ('approve', 'flag') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  UPDATE public.order_discount_reviews
  SET status = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'flagged' END,
      reviewed_by = auth.uid(), reviewed_at = NOW(), review_note = NULLIF(p_note, '')
  WHERE order_id = p_order_id AND tenant_id = caller_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found, or has no discount review to action'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_discount(UUID, TEXT, TEXT) TO authenticated;

-- process_checkout: same signature as 1786180000 (CREATE OR REPLACE only,
-- no DROP needed) -- inserts an order_discount_reviews row after the
-- order itself is created, when there's a discount to account for. A
-- vendor's own discount is exempt from this too, the same way it's
-- exempt from the pre-approval gate: there's no one above a vendor to
-- review their own discretionary discount.
CREATE OR REPLACE FUNCTION public.process_checkout(
  p_tenant_id UUID, p_branch_id UUID, p_user_id UUID, p_receipt_no TEXT,
  p_status TEXT, p_type TEXT, p_pos_mode TEXT, p_subtotal NUMERIC, p_tax NUMERIC,
  p_discount NUMERIC, p_total NUMERIC, p_payment_method TEXT, p_items JSONB,
  p_salesperson_name TEXT DEFAULT NULL, p_salesperson_employee_no TEXT DEFAULT NULL,
  p_client_ref UUID DEFAULT NULL, p_discount_auth_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; existing_order RECORD; new_order_id UUID;
  v_item JSONB; item_qty NUMERIC; item_pid UUID;
  v_order_no TEXT := p_receipt_no; v_attempt INT := 0;
  product_row RECORD; v_server_unit_price NUMERIC; v_tier JSONB;
  v_server_gross NUMERIC := 0; v_effective_discount NUMERIC; v_effective_discount_pct NUMERIC;
  v_computed_items JSONB := '[]'::jsonb;
  v_auth RECORD;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  IF p_client_ref IS NOT NULL THEN
    SELECT id, order_no INTO existing_order FROM public.orders
    WHERE tenant_id = p_tenant_id AND client_ref = p_client_ref;
  ELSE
    SELECT id, order_no INTO existing_order FROM public.orders
    WHERE tenant_id = p_tenant_id AND order_no = p_receipt_no;
  END IF;
  IF existing_order.id IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', existing_order.id, 'receipt_no', existing_order.order_no, 'already_processed', true);
  END IF;

  -- Pass 1: validate qty, lock + price every catalog-linked line, decrement
  -- stock, and accumulate the trusted (server-priced) gross. Locking here
  -- (not a separate pass) means the same row lock already needed for the
  -- stock decrement is reused for pricing too -- no extra round trip.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    item_pid := NULLIF(v_item->>'product_id', '')::UUID;
    item_qty := (v_item->>'qty')::NUMERIC;
    IF item_qty IS NULL OR item_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for %', COALESCE(v_item->>'name', 'item');
    END IF;

    IF item_pid IS NOT NULL THEN
      SELECT * INTO product_row FROM public.products WHERE id = item_pid AND tenant_id = p_tenant_id FOR UPDATE;
      IF product_row.id IS NULL THEN
        RAISE EXCEPTION 'Product not found for %', COALESCE(v_item->>'name', 'item');
      END IF;

      -- Same "highest qualifying tier whose price is lower wins" rule as
      -- cartStore.js's tieredUnitPrice() -- ported here so Hardware Mode
      -- bulk/trade pricing isn't broken by no longer trusting the client.
      v_server_unit_price := product_row.price;
      IF jsonb_typeof(product_row.price_tiers) = 'array' THEN
        FOR v_tier IN SELECT * FROM jsonb_array_elements(product_row.price_tiers) LOOP
          IF item_qty >= (v_tier->>'min_qty')::NUMERIC AND (v_tier->>'price')::NUMERIC < v_server_unit_price THEN
            v_server_unit_price := (v_tier->>'price')::NUMERIC;
          END IF;
        END LOOP;
      END IF;

      v_server_gross := v_server_gross + (v_server_unit_price * item_qty);

      IF NOT COALESCE(product_row.is_service, false) THEN
        UPDATE public.products
        SET stock_qty = stock_qty - item_qty, updated_at = NOW()
        WHERE id = item_pid AND stock_qty >= item_qty;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_item->>'name', product_row.name);
        END IF;
      END IF;

      v_computed_items := v_computed_items || jsonb_build_object(
        'product_id', item_pid, 'name', v_item->>'name', 'sku', v_item->>'sku',
        'qty', item_qty, 'unit_price', v_server_unit_price,
        'discount', COALESCE((v_item->>'discount')::NUMERIC, 0),
        'total', v_server_unit_price * item_qty * (1 - COALESCE((v_item->>'discount')::NUMERIC, 0) / 100)
      );
    ELSE
      -- Ad-hoc line (no catalog row to price against, e.g. job-card
      -- labour) -- keeps the client-submitted price as-is, unchanged.
      v_server_gross := v_server_gross + (COALESCE((v_item->>'unit_price')::NUMERIC, 0) * item_qty);
      v_computed_items := v_computed_items || v_item;
    END IF;
  END LOOP;

  -- The real discount, whatever produced it (cart discount, per-item
  -- discount, or a tampered total) -- negative means the customer's being
  -- charged MORE than the true priced value, which is just as invalid.
  v_effective_discount := v_server_gross - p_total;
  IF v_effective_discount < 0 THEN
    RAISE EXCEPTION 'Total exceeds the priced value of these items';
  END IF;
  v_effective_discount_pct := CASE WHEN v_server_gross > 0 THEN (v_effective_discount / v_server_gross) * 100 ELSE 0 END;

  -- A vendor needs no one's sign-off but their own -- they're already
  -- authorize_discount_override's highest tier (able to approve up to
  -- 100%), so gating their own checkout on a second self-login is
  -- friction, not control. Every other role still goes through the gate.
  IF v_effective_discount_pct > 10 AND caller_role != 'vendor' THEN
    IF p_discount_auth_id IS NULL THEN
      RAISE EXCEPTION 'A % percent discount needs manager authorization', round(v_effective_discount_pct);
    END IF;
    SELECT * INTO v_auth FROM public.discount_authorizations
    WHERE id = p_discount_auth_id AND tenant_id = p_tenant_id AND status = 'active'
      AND expires_at > NOW() AND max_discount_pct >= v_effective_discount_pct
      AND (branch_id IS NULL OR p_branch_id IS NULL OR branch_id = p_branch_id)
    FOR UPDATE;
    IF v_auth.id IS NULL THEN
      RAISE EXCEPTION 'Discount authorization is missing, expired, or not sufficient for this discount';
    END IF;
    UPDATE public.discount_authorizations SET status = 'consumed', consumed_at = NOW() WHERE id = v_auth.id;
  END IF;

  LOOP
    BEGIN
      INSERT INTO public.orders (
        tenant_id, branch_id, served_by, order_no, client_ref, status, type, pos_mode,
        subtotal, tax_amount, discount_amount, total, salesperson_name, salesperson_employee_no
      ) VALUES (
        p_tenant_id, p_branch_id, p_user_id, v_order_no, p_client_ref, p_status, p_type, p_pos_mode,
        p_subtotal, p_tax, p_discount, p_total, NULLIF(p_salesperson_name, ''), NULLIF(p_salesperson_employee_no, '')
      )
      RETURNING id INTO new_order_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= 5 THEN RAISE; END IF;
      v_order_no := p_receipt_no || '-' || substring(gen_random_uuid()::text, 1, 4);
    END;
  END LOOP;

  IF p_discount_auth_id IS NOT NULL THEN
    UPDATE public.discount_authorizations SET order_id = new_order_id WHERE id = p_discount_auth_id;
  END IF;

  -- Every discount needs a Vendor/Shop Manager's approval somewhere:
  -- >10% already got it before checkout (the authorization row above IS
  -- that approval, so this row is created pre-approved); <=10% hasn't
  -- been reviewed by anyone yet, so it's queued. A vendor's own discount
  -- answers to nobody, same as the gate above -- no row at all. No
  -- discount, no row either.
  IF v_effective_discount > 0 AND caller_role != 'vendor' THEN
    INSERT INTO public.order_discount_reviews (order_id, tenant_id, status, reviewed_by, reviewed_at)
    VALUES (
      new_order_id, p_tenant_id,
      CASE WHEN p_discount_auth_id IS NOT NULL THEN 'approved' ELSE 'pending' END,
      CASE WHEN p_discount_auth_id IS NOT NULL THEN v_auth.authorized_by ELSE NULL END,
      CASE WHEN p_discount_auth_id IS NOT NULL THEN v_auth.consumed_at ELSE NULL END
    );
  END IF;

  INSERT INTO public.order_items (order_id, product_id, name, sku, qty, unit_price, discount, total)
  SELECT new_order_id, NULLIF(elem->>'product_id', '')::UUID, elem->>'name', elem->>'sku',
    (elem->>'qty')::NUMERIC, (elem->>'unit_price')::NUMERIC, COALESCE((elem->>'discount')::NUMERIC, 0), (elem->>'total')::NUMERIC
  FROM jsonb_array_elements(v_computed_items) AS elem;

  INSERT INTO public.transactions (
    tenant_id, order_id, branch_id, processed_by, type, method, amount, reference, status
  ) VALUES (
    p_tenant_id, new_order_id, p_branch_id, p_user_id, 'sale', p_payment_method, p_total, v_order_no, 'completed'
  );

  RETURN jsonb_build_object('order_id', new_order_id, 'receipt_no', v_order_no, 'already_processed', false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.process_checkout(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB, TEXT, TEXT, UUID, UUID) TO authenticated;
