-- Direct stock-quantity correction, requested alongside Add Stock/Transfer
-- Stock: clients want to just type the right number and save, not go
-- through Stock Take's whole count-a-session workflow for a single quick
-- fix. This is deliberately NOT the same thing as re-enabling the Stock
-- field on the general product-edit form (updateProduct) -- that field was
-- disabled because a form left open for a while could silently overwrite
-- stock with a stale snapshot, undoing a real sale/receipt that happened
-- in between. This RPC avoids that failure mode the same way
-- receive_stock/transfer_stock/finalize_stock_take already do: it locks
-- the row and computes the actual delta against whatever stock_qty
-- genuinely is AT THE MOMENT OF SAVING, not at the moment the modal opened.

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  previous_qty NUMERIC NOT NULL,
  new_qty NUMERIC NOT NULL,
  delta NUMERIC NOT NULL,
  note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_tenant ON public.stock_adjustments(tenant_id, created_at DESC);

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_adjustments_tenant_access" ON public.stock_adjustments;
CREATE POLICY "stock_adjustments_tenant_access"
  ON public.stock_adjustments
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_tenant_id UUID, p_product_id UUID, p_new_qty NUMERIC, p_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT;
  src RECORD; v_delta NUMERIC;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to adjust stock';
  END IF;
  IF p_new_qty IS NULL OR p_new_qty < 0 THEN
    RAISE EXCEPTION 'New quantity cannot be negative';
  END IF;

  SELECT * INTO src FROM public.products WHERE id = p_product_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF src.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF src.is_service THEN RAISE EXCEPTION 'Services don''t carry stock'; END IF;

  v_delta := p_new_qty - COALESCE(src.stock_qty, 0);
  UPDATE public.products SET stock_qty = p_new_qty, updated_at = NOW() WHERE id = p_product_id;

  INSERT INTO public.stock_adjustments (tenant_id, product_id, previous_qty, new_qty, delta, note, created_by)
  VALUES (p_tenant_id, p_product_id, COALESCE(src.stock_qty, 0), p_new_qty, v_delta, p_note, auth.uid());

  RETURN jsonb_build_object('previous_qty', COALESCE(src.stock_qty, 0), 'new_qty', p_new_qty, 'delta', v_delta);
END;
$$;
GRANT EXECUTE ON FUNCTION public.adjust_stock(UUID, UUID, NUMERIC, TEXT) TO authenticated;
