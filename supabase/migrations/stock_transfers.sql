-- Simple branch-to-branch stock transfer: a product's stock is a single
-- number on its own row (branch_id is just its "home" branch, extra
-- branches only ever granted read/sell visibility via product_branches --
-- there's no separate per-branch stock count today). A transfer therefore
-- moves quantity from the source product's row to whatever row represents
-- the same item at the destination branch, creating that destination row
-- (cloned from the source) if one doesn't exist yet. Logged to
-- stock_transfers as a paper trail; the move itself is immediate, not a
-- send/receive workflow.

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  dest_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  from_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  to_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant ON public.stock_transfers(tenant_id, created_at DESC);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_transfers_tenant_access" ON public.stock_transfers;
CREATE POLICY "stock_transfers_tenant_access"
  ON public.stock_transfers
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE OR REPLACE FUNCTION public.transfer_stock(
  p_tenant_id UUID, p_product_id UUID, p_to_branch_id UUID, p_qty NUMERIC, p_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT;
  src RECORD; dest_id UUID; v_created BOOLEAN := false;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to transfer stock';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT * INTO src FROM public.products WHERE id = p_product_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF src.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF src.stock_qty < p_qty THEN RAISE EXCEPTION 'Insufficient stock to transfer'; END IF;
  IF src.branch_id IS NOT NULL AND src.branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'Source and destination branch must be different';
  END IF;

  UPDATE public.products SET stock_qty = stock_qty - p_qty, updated_at = NOW() WHERE id = p_product_id;

  SELECT id INTO dest_id FROM public.products
  WHERE tenant_id = p_tenant_id AND branch_id = p_to_branch_id
    AND ((src.sku IS NOT NULL AND sku = src.sku) OR (src.sku IS NULL AND lower(name) = lower(src.name)))
  LIMIT 1;

  IF dest_id IS NULL THEN
    v_created := true;
    INSERT INTO public.products (
      tenant_id, branch_id, name, brand, sku, barcode, price, cost_price,
      stock_qty, low_stock_threshold, unit, image_url, image_unavailable,
      vat_treatment, attributes, category_id, is_active, pos_visible
    ) VALUES (
      p_tenant_id, p_to_branch_id, src.name, src.brand, src.sku, src.barcode, src.price, src.cost_price,
      p_qty, src.low_stock_threshold, src.unit, src.image_url, src.image_unavailable,
      src.vat_treatment, src.attributes, src.category_id, true, true
    ) RETURNING id INTO dest_id;
  ELSE
    UPDATE public.products SET stock_qty = stock_qty + p_qty, updated_at = NOW() WHERE id = dest_id;
  END IF;

  INSERT INTO public.stock_transfers (tenant_id, product_id, dest_product_id, from_branch_id, to_branch_id, qty, note, created_by)
  VALUES (p_tenant_id, p_product_id, dest_id, src.branch_id, p_to_branch_id, p_qty, p_note, auth.uid());

  RETURN jsonb_build_object('dest_product_id', dest_id, 'created_new', v_created);
END;
$$;
GRANT EXECUTE ON FUNCTION public.transfer_stock(UUID, UUID, UUID, NUMERIC, TEXT) TO authenticated;
