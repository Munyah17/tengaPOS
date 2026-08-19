-- Offline-friendly counterpart to adjust_stock. adjust_stock (used live,
-- online) sets stock to an absolute number because it locks the row and
-- applies it at the exact moment of saving -- safe. But an Adjust Stock
-- submitted while offline can't apply immediately: it sits queued for
-- however long the device is disconnected, and REPLAYING that same
-- absolute "set to X" once back online would stomp whatever stock_qty
-- has genuinely become since then (a sale, a receipt, anything) -- the
-- exact stale-snapshot failure class this whole batch of fixes exists to
-- avoid. The queueing code computes the delta against what stock showed
-- at the moment the user submitted (their real, intended correction),
-- and this applies that delta on top of the CURRENT locked value instead
-- of overwriting it -- same principle as receive_stock/transfer_stock/
-- finalize_stock_take, just signed (a correction can go either direction,
-- unlike receive_stock's always-positive delivery).
CREATE OR REPLACE FUNCTION public.adjust_stock_by_delta(
  p_tenant_id UUID, p_product_id UUID, p_delta NUMERIC, p_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT;
  src RECORD; v_new_qty NUMERIC;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to adjust stock';
  END IF;
  IF p_delta IS NULL THEN
    RAISE EXCEPTION 'Delta is required';
  END IF;

  SELECT * INTO src FROM public.products WHERE id = p_product_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF src.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF src.is_service THEN RAISE EXCEPTION 'Services don''t carry stock'; END IF;

  v_new_qty := GREATEST(0, COALESCE(src.stock_qty, 0) + p_delta);
  UPDATE public.products SET stock_qty = v_new_qty, updated_at = NOW() WHERE id = p_product_id;

  INSERT INTO public.stock_adjustments (tenant_id, product_id, previous_qty, new_qty, delta, note, created_by)
  VALUES (p_tenant_id, p_product_id, COALESCE(src.stock_qty, 0), v_new_qty, v_new_qty - COALESCE(src.stock_qty, 0), p_note, auth.uid());

  RETURN jsonb_build_object('previous_qty', COALESCE(src.stock_qty, 0), 'new_qty', v_new_qty, 'delta', v_new_qty - COALESCE(src.stock_qty, 0));
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjust_stock_by_delta(UUID, UUID, NUMERIC, TEXT) TO authenticated;
