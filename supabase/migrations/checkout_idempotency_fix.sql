-- Root cause of repeated "sale not recording under Orders, stock not
-- decremented" reports: process_checkout's idempotency check used the
-- PRINTED receipt number (order_no, format TP-YYMMDD-RRRR with only a
-- 4-digit random suffix -- 10,000 slots per tenant per day) as the dedup
-- key. Two entirely UNRELATED sales that happened to land on the same
-- random suffix on the same day got misidentified as "this is a retry of
-- that earlier sale" -- the function silently returned the OLD order's id
-- without creating a new order or decrementing stock for the new sale,
-- while the POS UI still showed a normal successful checkout (no error
-- was raised). With even a moderately busy day (a few dozen sales) this
-- collision probability is far from negligible.
--
-- Fix: a real, client-generated, effectively-collision-free UUID
-- (client_ref) becomes the actual dedup key. order_no stays exactly what
-- it always was -- a human-readable printed number -- and is no longer
-- load-bearing for correctness. Backward compatible: any sale already
-- sitting in a browser's offline queue from before this shipped has no
-- client_ref, so the function falls back to the old order_no-based check
-- for those specific legacy payloads only.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_ref UUID;
-- NULLs don't conflict under a UNIQUE constraint, so this is safe to add
-- without backfilling every historical row.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tenant_client_ref_uniq;
ALTER TABLE public.orders ADD CONSTRAINT orders_tenant_client_ref_uniq UNIQUE (tenant_id, client_ref);

DROP FUNCTION IF EXISTS public.process_checkout(uuid, uuid, uuid, text, text, text, text, numeric, numeric, numeric, numeric, text, jsonb, text, text);

CREATE FUNCTION public.process_checkout(
  p_tenant_id uuid, p_branch_id uuid, p_user_id uuid, p_receipt_no text, p_status text,
  p_type text, p_pos_mode text, p_subtotal numeric, p_tax numeric, p_discount numeric,
  p_total numeric, p_payment_method text, p_items jsonb,
  p_salesperson_name text DEFAULT NULL::text, p_salesperson_employee_no text DEFAULT NULL::text,
  p_client_ref uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_tenant UUID;
  existing_order RECORD;
  new_order_id UUID;
  item JSONB;
  item_qty INT;
  item_pid UUID;
  v_order_no TEXT := p_receipt_no;
  v_attempt INT := 0;
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

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    item_pid := NULLIF(item->>'product_id', '')::UUID;
    item_qty := (item->>'qty')::INT;
    IF item_pid IS NOT NULL THEN
      UPDATE public.products
      SET stock_qty = stock_qty - item_qty, updated_at = NOW()
      WHERE id = item_pid AND tenant_id = p_tenant_id AND stock_qty >= item_qty;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient stock for %', COALESCE(item->>'name', 'product');
      END IF;
    END IF;
  END LOOP;

  -- order_no is no longer the correctness mechanism (client_ref is), but
  -- it still has its own UNIQUE constraint as a printed-number guarantee.
  -- A genuine collision between two different sales on the same random
  -- suffix is now rare (widened to 6 digits client-side) but not
  -- impossible -- retry a few times with a fresh suffix rather than fail
  -- the whole sale over what's ultimately a cosmetic number.
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
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
      v_order_no := p_receipt_no || '-' || substring(gen_random_uuid()::text, 1, 4);
    END;
  END LOOP;

  INSERT INTO public.order_items (order_id, product_id, name, sku, qty, unit_price, discount, total)
  SELECT
    new_order_id,
    NULLIF(item->>'product_id', '')::UUID,
    item->>'name',
    item->>'sku',
    (item->>'qty')::INT,
    (item->>'unit_price')::NUMERIC,
    COALESCE((item->>'discount')::NUMERIC, 0),
    (item->>'total')::NUMERIC
  FROM jsonb_array_elements(p_items) AS item;

  INSERT INTO public.transactions (
    tenant_id, order_id, branch_id, processed_by, type, method, amount, reference, status
  ) VALUES (
    p_tenant_id, new_order_id, p_branch_id, p_user_id, 'sale', p_payment_method, p_total, v_order_no, 'completed'
  );

  RETURN jsonb_build_object('order_id', new_order_id, 'receipt_no', v_order_no, 'already_processed', false);
END;
$function$;
