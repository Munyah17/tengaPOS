-- validate_return already required prior shop_manager/supervisor approval
-- and was already vendor-only -- but it restored stock on nothing more
-- than that. Nothing ever confirmed the returned goods actually came back
-- in sellable condition. This adds that missing physical-inspection step
-- to the same call, rather than a new async tier: the vendor giving final
-- validation is the natural person to also confirm what physically came
-- back, and stock is now only restored when it's confirmed sellable --
-- damaged/non-returnable goods still get refunded (that was already
-- decided at request time) but never silently re-enter sellable inventory.

ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS goods_condition TEXT CHECK (goods_condition IN ('sellable', 'damaged', 'not_returnable')),
  ADD COLUMN IF NOT EXISTS inspection_notes TEXT,
  ADD COLUMN IF NOT EXISTS inspected_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ;

DROP FUNCTION IF EXISTS public.validate_return(UUID);

CREATE OR REPLACE FUNCTION public.validate_return(
  p_return_id UUID, p_goods_condition TEXT, p_inspection_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_tenant_id UUID;
  v_branch_id UUID;
  v_refund_amount NUMERIC;
  v_tx_id UUID;
BEGIN
  IF get_user_role() != 'vendor' THEN
    RAISE EXCEPTION 'Only the Vendor can give final validation on a return';
  END IF;
  IF p_goods_condition IS NULL OR p_goods_condition NOT IN ('sellable', 'damaged', 'not_returnable') THEN
    RAISE EXCEPTION 'Physical inspection confirmation is required before validating a return';
  END IF;

  SELECT r.order_id, r.tenant_id, r.refund_amount, o.branch_id
  INTO v_order_id, v_tenant_id, v_refund_amount, v_branch_id
  FROM public.returns r
  JOIN public.orders o ON o.id = r.order_id
  WHERE r.id = p_return_id AND r.tenant_id = get_user_tenant_id() AND r.status = 'approved';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Return request not found or not awaiting validation';
  END IF;

  -- Only restore stock when the goods actually came back sellable —
  -- damaged/not-returnable goods still get refunded below (already
  -- decided when the return was requested/approved) but never silently
  -- re-enter inventory that could get sold again.
  IF p_goods_condition = 'sellable' THEN
    UPDATE public.products p
    SET stock_qty = p.stock_qty + oi.qty, updated_at = NOW()
    FROM public.order_items oi
    WHERE oi.order_id = v_order_id AND oi.product_id = p.id;
  END IF;

  UPDATE public.orders SET status = 'returned', updated_at = NOW() WHERE id = v_order_id;

  INSERT INTO public.transactions (tenant_id, order_id, branch_id, processed_by, type, method, amount, status, notes)
  VALUES (v_tenant_id, v_order_id, v_branch_id, auth.uid(), 'refund', 'refund', -v_refund_amount, 'completed', 'Refund for returned goods')
  RETURNING id INTO v_tx_id;

  UPDATE public.returns
  SET status = 'validated', validated_by = auth.uid(), validated_at = NOW(), refund_transaction_id = v_tx_id,
      goods_condition = p_goods_condition, inspection_notes = p_inspection_notes,
      inspected_by = auth.uid(), inspected_at = NOW()
  WHERE id = p_return_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.validate_return(UUID, TEXT, TEXT) TO authenticated;
