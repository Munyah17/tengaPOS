-- Services (labour, wheel alignment, consultations, etc.) were being
-- catalogued as regular products, meaning they carry a stock_qty like any
-- physical item. Since a service never restocks, stock_qty inevitably hits
-- zero and process_checkout's stock check (correctly, for physical goods)
-- then blocks every future sale of it with "Insufficient stock" — even
-- though a service has no stock concept to run out of.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_service BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.process_checkout(
  p_tenant_id UUID, p_branch_id UUID, p_user_id UUID, p_receipt_no TEXT,
  p_status TEXT, p_type TEXT, p_pos_mode TEXT, p_subtotal NUMERIC, p_tax NUMERIC,
  p_discount NUMERIC, p_total NUMERIC, p_payment_method TEXT, p_items JSONB,
  p_salesperson_name TEXT DEFAULT NULL, p_salesperson_employee_no TEXT DEFAULT NULL,
  p_client_ref UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; existing_order RECORD; new_order_id UUID;
  v_item JSONB; item_qty NUMERIC; item_pid UUID; item_is_service BOOLEAN;
  v_order_no TEXT := p_receipt_no; v_attempt INT := 0;
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
      SELECT is_service INTO item_is_service FROM public.products WHERE id = item_pid AND tenant_id = p_tenant_id;
      -- A service has no stock to run out of — skip the reservation
      -- entirely instead of decrementing (and eventually blocking on) a
      -- quantity concept that doesn't apply to it.
      IF NOT COALESCE(item_is_service, false) THEN
        UPDATE public.products
        SET stock_qty = stock_qty - item_qty, updated_at = NOW()
        WHERE id = item_pid AND tenant_id = p_tenant_id AND stock_qty >= item_qty;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Insufficient stock for %', COALESCE(v_item->>'name', 'product');
        END IF;
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
$$;
