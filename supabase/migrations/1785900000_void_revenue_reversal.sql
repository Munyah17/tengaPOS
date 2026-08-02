-- validate_void() restored stock and flipped orders.status to 'voided', but
-- never touched the transactions table -- the original 'completed' sale
-- transaction stayed exactly as it was, so fetchReportMetrics/
-- fetchDashboardMetrics (both SUM(amount) WHERE status='completed') kept
-- counting voided sales in revenue forever. validate_return() already solved
-- this correctly for returns: instead of mutating the original sale record,
-- it inserts a NEW negative transaction as a reversal, which nets the sum to
-- zero without touching the original audit record. This brings validate_void
-- in line with that same, already-proven pattern.
CREATE OR REPLACE FUNCTION public.validate_void(p_void_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_tenant_id UUID;
  v_branch_id UUID;
  v_total NUMERIC;
BEGIN
  IF get_user_role() != 'vendor' THEN
    RAISE EXCEPTION 'Only the Vendor can give final validation on a void';
  END IF;

  SELECT vo.order_id, vo.tenant_id, o.branch_id, o.total
  INTO v_order_id, v_tenant_id, v_branch_id, v_total
  FROM public.voids vo
  JOIN public.orders o ON o.id = vo.order_id
  WHERE vo.id = p_void_id AND vo.tenant_id = get_user_tenant_id() AND vo.status = 'approved';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Void request not found or not awaiting validation';
  END IF;

  -- Restore stock for every line on the voided order
  UPDATE public.products p
  SET stock_qty = p.stock_qty + oi.qty, updated_at = NOW()
  FROM public.order_items oi
  WHERE oi.order_id = v_order_id AND oi.product_id = p.id;

  UPDATE public.orders SET status = 'voided', updated_at = NOW() WHERE id = v_order_id;

  -- Reversal transaction -- same convention as validate_return's refund row.
  -- The original 'sale' transaction is left untouched for audit history;
  -- this negative entry is what makes revenue sums correctly net a voided
  -- sale to zero instead of still counting it.
  INSERT INTO public.transactions (tenant_id, order_id, branch_id, processed_by, type, method, amount, status, notes)
  VALUES (v_tenant_id, v_order_id, v_branch_id, auth.uid(), 'void', 'void', -v_total, 'completed', 'Reversal for voided sale');

  UPDATE public.voids
  SET status = 'validated', validated_by = auth.uid(), validated_at = NOW()
  WHERE id = p_void_id;
END;
$$;

-- Backfill: any order already sitting at status='voided' from before this
-- fix existed still has its original 'completed' transaction uncorrected in
-- past reports. One-time reversal for those, guarded so it can never
-- double-insert if this migration is somehow re-run.
INSERT INTO public.transactions (tenant_id, order_id, branch_id, processed_by, type, method, amount, status, notes)
SELECT o.tenant_id, o.id, o.branch_id, v.validated_by, 'void', 'void', -o.total, 'completed', 'Backfilled reversal for a void validated before this fix'
FROM public.orders o
JOIN public.voids v ON v.order_id = o.id AND v.status = 'validated'
WHERE o.status = 'voided'
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t WHERE t.order_id = o.id AND t.type = 'void'
  );
