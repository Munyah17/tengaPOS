-- Salesperson attribution at checkout: distinct from the cashier
-- (`served_by`), optional, either picked from staff (snapshots their name +
-- employee number at sale time, same pattern order_items already uses for
-- product name/sku) or typed in manually. Receipts stay silent about it
-- entirely when none was selected — no "Salesperson: N/A" line.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employee_no TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS salesperson_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS salesperson_employee_no TEXT;

DROP FUNCTION IF EXISTS public.process_checkout(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.process_checkout(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_user_id UUID,
  p_receipt_no TEXT,
  p_status TEXT,
  p_type TEXT,
  p_pos_mode TEXT,
  p_subtotal NUMERIC,
  p_tax NUMERIC,
  p_discount NUMERIC,
  p_total NUMERIC,
  p_payment_method TEXT,
  p_items JSONB,
  p_salesperson_name TEXT DEFAULT NULL,
  p_salesperson_employee_no TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID;
  existing_order RECORD;
  new_order_id UUID;
  item JSONB;
  item_qty INT;
  item_pid UUID;
BEGIN
  SELECT tenant_id INTO caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  SELECT id, order_no INTO existing_order FROM public.orders
  WHERE tenant_id = p_tenant_id AND order_no = p_receipt_no;
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

  INSERT INTO public.orders (
    tenant_id, branch_id, served_by, order_no, status, type, pos_mode,
    subtotal, tax_amount, discount_amount, total, salesperson_name, salesperson_employee_no
  ) VALUES (
    p_tenant_id, p_branch_id, p_user_id, p_receipt_no, p_status, p_type, p_pos_mode,
    p_subtotal, p_tax, p_discount, p_total, NULLIF(p_salesperson_name, ''), NULLIF(p_salesperson_employee_no, '')
  )
  RETURNING id INTO new_order_id;

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
    p_tenant_id, new_order_id, p_branch_id, p_user_id, 'sale', p_payment_method, p_total, p_receipt_no, 'completed'
  );

  RETURN jsonb_build_object('order_id', new_order_id, 'receipt_no', p_receipt_no, 'already_processed', false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.process_checkout(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB, TEXT, TEXT) TO authenticated;
