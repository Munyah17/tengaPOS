-- Reported live: clients want to top up an existing product's stock (a new
-- delivery of the exact same sugar, say) without going through "Edit
-- Product" and overwriting the stock number by hand -- that's error-prone
-- (typing the new total instead of the delta is an easy mistake) and
-- leaves no record of what happened. This adds a dedicated ADD, not SET,
-- path with its own audit trail -- same shape as stock_transfers.sql's
-- proven pattern (its own table + a locking, role-checked RPC), but
-- simpler: no destination branch/product involved, just "this many more of
-- this exact product, right now."

CREATE TABLE IF NOT EXISTS public.stock_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_receipts_tenant ON public.stock_receipts(tenant_id, created_at DESC);

ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_receipts_tenant_access" ON public.stock_receipts;
CREATE POLICY "stock_receipts_tenant_access"
  ON public.stock_receipts
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE OR REPLACE FUNCTION public.receive_stock(
  p_tenant_id UUID, p_product_id UUID, p_qty NUMERIC, p_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT;
  src RECORD; new_qty NUMERIC;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to receive stock';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT * INTO src FROM public.products WHERE id = p_product_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF src.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF src.is_service THEN RAISE EXCEPTION 'Services don''t carry stock'; END IF;

  -- Blank stock_qty ("not counted yet") is treated as 0 here -- receiving
  -- stock is exactly the moment it becomes counted, same reasoning as
  -- parseOptionalNumber's blank-vs-zero distinction elsewhere in the app.
  new_qty := COALESCE(src.stock_qty, 0) + p_qty;
  UPDATE public.products SET stock_qty = new_qty, updated_at = NOW() WHERE id = p_product_id;

  INSERT INTO public.stock_receipts (tenant_id, product_id, qty, note, created_by)
  VALUES (p_tenant_id, p_product_id, p_qty, p_note, auth.uid());

  RETURN jsonb_build_object('new_stock_qty', new_qty);
END;
$$;
GRANT EXECUTE ON FUNCTION public.receive_stock(UUID, UUID, NUMERIC, TEXT) TO authenticated;
