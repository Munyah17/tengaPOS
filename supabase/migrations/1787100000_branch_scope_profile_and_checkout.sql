-- Branch isolation, part 2: get_my_profile and process_checkout.
--
-- get_my_profile joined branches on is_main = true for EVERY tenant user,
-- so users.branch_id (which staff creation correctly requires and stores)
-- was never read -- every cashier/manager signed in "as" the main branch
-- no matter where they actually worked. Every order, transaction, cash-up,
-- stock take, job card and document was stamped with the main branch, and
-- branch-scoped things keyed off authStore.branch (receipt config, POS
-- staff list, branch filters) all resolved to the wrong branch. That is
-- the "branches interfering with each other's data" report.
--
-- Fix: return the user's own branch (users.branch_id), falling back to
-- the tenant's main branch only when they have none (vendor accounts have
-- branch_id NULL by design, and legacy staff rows predate the requirement).
--
-- process_checkout is SECURITY DEFINER, so it bypasses the branch_scope_*
-- RLS policies entirely -- until now a caller could decrement ANY product
-- row in the tenant (including another branch's stock) while stamping the
-- order with whatever branch_id they liked. Two guards close that:
--   1. Non-vendor callers may only stamp orders on a branch they belong
--      to (home branch or an explicit user_branches grant) -- vendors see
--      every branch, matching the RLS policies.
--   2. Each catalog line's product must be sellable at p_branch_id: its
--      home branch, a product_branches grant for that branch, or a shared
--      product (branch_id NULL with no grants). p_branch_id NULL keeps
--      the legacy unscoped behaviour for old queued sales.

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT to_jsonb(au.*) || jsonb_build_object('userType', 'app_owner')
  INTO result
  FROM public.app_users au
  WHERE au.id = auth.uid();

  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  SELECT to_jsonb(u.*)
    || jsonb_build_object(
         'tenants', to_jsonb(t.*),
         'branch', to_jsonb(b.*),
         'userType', 'tenant',
         'tenantStatus', COALESCE(t.status, 'pending')
       )
  INTO result
  FROM public.users u
  LEFT JOIN public.tenants t ON t.id = u.tenant_id
  LEFT JOIN public.branches b ON b.id = (
    SELECT COALESCE(
      (SELECT b2.id FROM public.branches b2 WHERE b2.id = u.branch_id AND b2.deleted_at IS NULL),
      (SELECT b3.id FROM public.branches b3
       WHERE b3.tenant_id = u.tenant_id AND b3.is_main = true AND b3.deleted_at IS NULL
       LIMIT 1)
    )
  )
  WHERE u.id = auth.uid();

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.process_checkout(
  p_tenant_id UUID, p_branch_id UUID, p_user_id UUID, p_receipt_no TEXT,
  p_status TEXT, p_type TEXT, p_pos_mode TEXT, p_subtotal NUMERIC, p_tax NUMERIC,
  p_discount NUMERIC, p_total NUMERIC, p_payment_method TEXT, p_items JSONB,
  p_salesperson_name TEXT DEFAULT NULL, p_salesperson_employee_no TEXT DEFAULT NULL,
  p_client_ref UUID DEFAULT NULL, p_discount_auth_id UUID DEFAULT NULL,
  p_customer_details JSONB DEFAULT NULL
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

  -- Branch scope on the order itself: staff may only record sales against
  -- a branch they belong to. Vendors are exempt (they oversee every
  -- branch), matching branch_scope_orders/transactions. Users with no
  -- branch assignments at all (legacy rows predating the branch
  -- requirement) stay unscoped rather than being locked out of checkout.
  IF p_branch_id IS NOT NULL AND caller_role <> 'vendor'
     AND EXISTS (SELECT 1 FROM public.get_user_branch_ids())
     AND NOT (p_branch_id IN (SELECT public.get_user_branch_ids())) THEN
    RAISE EXCEPTION 'Not authorized to sell at this branch';
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

      -- The product must actually be sellable at the order's branch:
      -- its home branch, a product_branches grant for that branch, or a
      -- shared catalog item (branch_id NULL with no grants). Selling a
      -- branch-owned row under a different branch's order would drain
      -- that branch's stock while the sale reports somewhere else.
      IF p_branch_id IS NOT NULL AND NOT (
        product_row.branch_id = p_branch_id
        OR EXISTS (
          SELECT 1 FROM public.product_branches pb
          WHERE pb.product_id = item_pid AND pb.branch_id = p_branch_id
        )
        OR (
          product_row.branch_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.product_branches pb2 WHERE pb2.product_id = item_pid
          )
        )
      ) THEN
        RAISE EXCEPTION 'Product % is not stocked at this branch', COALESCE(product_row.name, 'item');
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
        subtotal, tax_amount, discount_amount, total, salesperson_name, salesperson_employee_no,
        customer_details
      ) VALUES (
        p_tenant_id, p_branch_id, p_user_id, v_order_no, p_client_ref, p_status, p_type, p_pos_mode,
        p_subtotal, p_tax, p_discount, p_total, NULLIF(p_salesperson_name, ''), NULLIF(p_salesperson_employee_no, ''),
        p_customer_details
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
GRANT EXECUTE ON FUNCTION public.process_checkout(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB, TEXT, TEXT, UUID, UUID, JSONB) TO authenticated;

-- ─── Branch scope on every other branch-tagged table ──────────────────────
-- branch_isolation.sql only covered products/orders/transactions, so every
-- other table carrying branch_id (job cards, documents, cash-ups, stock
-- takes, appointments, prescriptions, expenses, etc.) was still tenant-wide
-- for any staff role -- branch B's job cards and cash-ups were visible to
-- branch A's staff. Same RESTRICTIVE policy shape as branch_scope_orders:
-- super admins and Vendors bypass (they oversee every branch), rows with
-- no branch stay visible to everyone (unscoped/legacy data), and everyone
-- else only sees rows tagged to a branch they belong to. FOR ALL (not just
-- SELECT) so writes can't be tagged to a foreign branch either -- same
-- choice staff_shifts.sql already made.

DO $$
DECLARE
  t TEXT;
  scoped_tables TEXT[] := ARRAY[
    'job_cards', 'documents', 'cash_ups', 'stock_takes', 'appointments',
    'prescriptions', 'prescription_dispenses', 'age_verifications',
    'equipment_rentals', 'production_runs', 'expenses',
    'petty_cash_transactions', 'cash_transactions', 'requisitions',
    'bank_reconciliations', 'fixed_assets', 'drawer_events', 'sos_alerts',
    'medication_schedules', 'discount_authorizations'
  ];
BEGIN
  FOREACH t IN ARRAY scoped_tables LOOP
    -- Only apply where the column actually exists -- keeps this migration
    -- safe even if a table was renamed or a branch_id column dropped.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'branch_id'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'branch_scope_' || t, t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL USING (
           public.is_super_admin()
           OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = ''vendor'')
           OR %I.branch_id IS NULL
           OR %I.branch_id IN (SELECT public.get_user_branch_ids())
         ) WITH CHECK (
           public.is_super_admin()
           OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = ''vendor'')
           OR %I.branch_id IS NULL
           OR %I.branch_id IN (SELECT public.get_user_branch_ids())
         )',
        'branch_scope_' || t, t, t, t, t, t
      );
    END IF;
  END LOOP;
END $$;

-- stock_transfers names its branches differently (from_/to_) and a row is
-- relevant to either endpoint's staff, so it gets its own policy.
DROP POLICY IF EXISTS "branch_scope_stock_transfers" ON public.stock_transfers;
CREATE POLICY "branch_scope_stock_transfers"
  ON public.stock_transfers
  AS RESTRICTIVE
  FOR ALL
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'vendor')
    OR from_branch_id IS NULL
    OR from_branch_id IN (SELECT public.get_user_branch_ids())
    OR to_branch_id IN (SELECT public.get_user_branch_ids())
  )
  WITH CHECK (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'vendor')
    OR from_branch_id IS NULL
    OR from_branch_id IN (SELECT public.get_user_branch_ids())
    OR to_branch_id IN (SELECT public.get_user_branch_ids())
  );

-- ─── Grant scoping: branch access is Vendor-only ───────────────────────────
-- assign_user_branch/assign_product_branch (branch_isolation.sql) allowed
-- vendor AND shop_manager to grant any branch in the tenant -- so a branch
-- manager could widen their own or anyone else's access at will. Cross-
-- branch access is now granted exclusively by the Vendor; a shop_manager
-- is scoped to their assigned branches exactly like every other staff
-- member and must be assigned by the Vendor first.

CREATE OR REPLACE FUNCTION public.assign_user_branch(p_user_id UUID, p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  target_tenant UUID;
  branch_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  -- Vendor only: cross-branch access is granted exclusively by the owner.
  -- A shop_manager is scoped to their own assigned branches exactly like
  -- every other staff member and cannot widen anyone's access themselves.
  IF caller_role <> 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can assign branches';
  END IF;

  SELECT tenant_id INTO target_tenant FROM public.users WHERE id = p_user_id;
  SELECT tenant_id INTO branch_tenant FROM public.branches WHERE id = p_branch_id;
  IF target_tenant IS NULL OR target_tenant != caller_tenant OR branch_tenant IS NULL OR branch_tenant != caller_tenant THEN
    RAISE EXCEPTION 'User or branch not found in your business';
  END IF;

  INSERT INTO public.user_branches (user_id, branch_id) VALUES (p_user_id, p_branch_id)
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_user_branch(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_user_branch(p_user_id UUID, p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role <> 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can modify branch assignments';
  END IF;

  DELETE FROM public.user_branches
  WHERE user_id = p_user_id AND branch_id = p_branch_id
    AND user_id IN (SELECT id FROM public.users WHERE tenant_id = caller_tenant);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unassign_user_branch(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_product_branch(p_product_id UUID, p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  product_tenant UUID;
  branch_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role <> 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can assign branches';
  END IF;

  SELECT tenant_id INTO product_tenant FROM public.products WHERE id = p_product_id;
  SELECT tenant_id INTO branch_tenant FROM public.branches WHERE id = p_branch_id;
  IF product_tenant IS NULL OR product_tenant != caller_tenant OR branch_tenant IS NULL OR branch_tenant != caller_tenant THEN
    RAISE EXCEPTION 'Product or branch not found in your business';
  END IF;

  INSERT INTO public.product_branches (product_id, branch_id) VALUES (p_product_id, p_branch_id)
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_product_branch(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_product_branch(p_product_id UUID, p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role <> 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can modify branch assignments';
  END IF;

  DELETE FROM public.product_branches
  WHERE product_id = p_product_id AND branch_id = p_branch_id
    AND product_id IN (SELECT id FROM public.products WHERE tenant_id = caller_tenant);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unassign_product_branch(UUID, UUID) TO authenticated;
