-- Hardware Store items are commonly sold by weight/length/volume (nails by
-- kg, pipe by the metre, paint by the litre), not just whole units. This
-- widens the shared stock/quantity columns used by every mode's checkout
-- so a product CAN carry a fractional quantity -- it's inert plumbing for
-- any tenant that never enters a decimal (2 stored as NUMERIC is still
-- just 2). The UI surface for entering decimals stays module-scoped
-- (Hardware Mode only) -- this migration is backend-only.
ALTER TABLE public.products ALTER COLUMN stock_qty TYPE NUMERIC(12,3);
ALTER TABLE public.order_items ALTER COLUMN qty TYPE NUMERIC(12,3);

-- process_checkout: identical to checkout_idempotency_fix.sql except
-- item_qty is now NUMERIC and both `(item->>'qty')::INT` casts became
-- `::NUMERIC` -- everything else (idempotency, retry-on-collision,
-- transactions insert) is unchanged.
--
-- CORRECTION (same day): the loop variable `item` and the `AS item` alias
-- in the final INSERT...SELECT collided -- "column reference \"item\" is
-- ambiguous" (42702), on every single call, confirmed via direct testing.
-- This broke checkout for every tenant until caught. Renamed the loop
-- variable to v_item and the final SELECT's alias to elem so there's no
-- shared name between a PL/pgSQL variable and a query-scoped alias.
CREATE OR REPLACE FUNCTION public.process_checkout(
  p_tenant_id uuid, p_branch_id uuid, p_user_id uuid, p_receipt_no text, p_status text,
  p_type text, p_pos_mode text, p_subtotal numeric, p_tax numeric, p_discount numeric,
  p_total numeric, p_payment_method text, p_items jsonb,
  p_salesperson_name text DEFAULT NULL::text, p_salesperson_employee_no text DEFAULT NULL::text,
  p_client_ref uuid DEFAULT NULL::uuid
)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  caller_tenant UUID; existing_order RECORD; new_order_id UUID;
  v_item JSONB; item_qty NUMERIC; item_pid UUID; v_order_no TEXT := p_receipt_no; v_attempt INT := 0;
BEGIN
  SELECT tenant_id INTO caller_tenant FROM public.users WHERE id = auth.uid();
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    item_pid := NULLIF(v_item->>'product_id', '')::UUID;
    item_qty := (v_item->>'qty')::NUMERIC;
    IF item_pid IS NOT NULL THEN
      UPDATE public.products
      SET stock_qty = stock_qty - item_qty, updated_at = NOW()
      WHERE id = item_pid AND tenant_id = p_tenant_id AND stock_qty >= item_qty;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_item->>'name', 'product');
      END IF;
    END IF;
  END LOOP;

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

  INSERT INTO public.order_items (order_id, product_id, name, sku, qty, unit_price, discount, total)
  SELECT new_order_id, NULLIF(elem->>'product_id', '')::UUID, elem->>'name', elem->>'sku',
    (elem->>'qty')::NUMERIC, (elem->>'unit_price')::NUMERIC, COALESCE((elem->>'discount')::NUMERIC, 0), (elem->>'total')::NUMERIC
  FROM jsonb_array_elements(p_items) AS elem;

  INSERT INTO public.transactions (
    tenant_id, order_id, branch_id, processed_by, type, method, amount, reference, status
  ) VALUES (
    p_tenant_id, new_order_id, p_branch_id, p_user_id, 'sale', p_payment_method, p_total, v_order_no, 'completed'
  );

  RETURN jsonb_build_object('order_id', new_order_id, 'receipt_no', v_order_no, 'already_processed', false);
END;
$function$;

-- decrement_stock: not currently called from the frontend, but widened
-- for consistency with the columns above.
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id UUID, p_qty NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_tenant UUID;
  new_qty NUMERIC;
  prod_name TEXT;
BEGIN
  SELECT tenant_id INTO caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Not a tenant user';
  END IF;
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  UPDATE public.products
  SET stock_qty = stock_qty - p_qty, updated_at = NOW()
  WHERE id = p_product_id
    AND tenant_id = caller_tenant
    AND stock_qty >= p_qty
  RETURNING stock_qty, name INTO new_qty, prod_name;

  IF new_qty IS NULL THEN
    SELECT name INTO prod_name FROM public.products WHERE id = p_product_id AND tenant_id = caller_tenant;
    RAISE EXCEPTION 'Insufficient stock for %', COALESCE(prod_name, 'product');
  END IF;

  RETURN new_qty;
END;
$$;
