-- Manufacturing Mode: a finished product's Bill of Materials (which other
-- products, and how much of each, go into making 1 unit of it) plus
-- production runs that consume those raw materials from stock and add the
-- finished good to stock -- the same "simple, immediate" pattern as
-- stock_transfers.sql, not a multi-stage workflow.

CREATE TABLE IF NOT EXISTS public.bill_of_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  finished_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty_per_unit NUMERIC NOT NULL CHECK (qty_per_unit > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (finished_product_id, component_product_id),
  CHECK (finished_product_id != component_product_id)
);

CREATE INDEX IF NOT EXISTS idx_bom_tenant ON public.bill_of_materials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bom_finished_product ON public.bill_of_materials(finished_product_id);

CREATE TABLE IF NOT EXISTS public.production_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  finished_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty_produced NUMERIC NOT NULL CHECK (qty_produced > 0),
  note TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_runs_tenant ON public.production_runs(tenant_id, created_at DESC);

ALTER TABLE public.bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bom_tenant_access" ON public.bill_of_materials;
CREATE POLICY "bom_tenant_access"
  ON public.bill_of_materials
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

DROP POLICY IF EXISTS "production_runs_tenant_access" ON public.production_runs;
CREATE POLICY "production_runs_tenant_access"
  ON public.production_runs
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

-- Records a production run: consumes each BOM component's stock (scaled by
-- qty), adds qty to the finished product's stock, logs it. If the finished
-- product has no BOM defined yet, it just adds stock -- lets a tenant use
-- this before they've set up a BOM, same as a manual stock adjustment.
CREATE OR REPLACE FUNCTION public.record_production_run(
  p_tenant_id UUID, p_finished_product_id UUID, p_qty NUMERIC, p_branch_id UUID DEFAULT NULL, p_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT;
  finished RECORD; comp RECORD; run_id UUID;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to record production runs';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity produced must be greater than zero';
  END IF;

  SELECT * INTO finished FROM public.products WHERE id = p_finished_product_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF finished.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;

  -- Lock every component row up front (consistent order: by id) so two
  -- concurrent production runs sharing a raw material can't both pass the
  -- stock check before either commits.
  FOR comp IN
    SELECT p.id, p.name, p.stock_qty, bom.qty_per_unit
    FROM public.bill_of_materials bom
    JOIN public.products p ON p.id = bom.component_product_id
    WHERE bom.finished_product_id = p_finished_product_id AND bom.tenant_id = p_tenant_id
    ORDER BY p.id
    FOR UPDATE OF p
  LOOP
    IF comp.stock_qty < comp.qty_per_unit * p_qty THEN
      RAISE EXCEPTION 'Insufficient stock of % to produce % unit(s)', comp.name, p_qty;
    END IF;
  END LOOP;

  UPDATE public.products p
  SET stock_qty = stock_qty - (bom.qty_per_unit * p_qty), updated_at = NOW()
  FROM public.bill_of_materials bom
  WHERE bom.finished_product_id = p_finished_product_id AND bom.tenant_id = p_tenant_id AND p.id = bom.component_product_id;

  UPDATE public.products SET stock_qty = stock_qty + p_qty, updated_at = NOW() WHERE id = p_finished_product_id;

  INSERT INTO public.production_runs (tenant_id, branch_id, finished_product_id, qty_produced, note, created_by)
  VALUES (p_tenant_id, p_branch_id, p_finished_product_id, p_qty, p_note, auth.uid())
  RETURNING id INTO run_id;

  RETURN jsonb_build_object('run_id', run_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_production_run(UUID, UUID, NUMERIC, UUID, TEXT) TO authenticated;
