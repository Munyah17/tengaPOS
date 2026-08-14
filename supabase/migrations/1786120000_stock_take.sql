-- Physical inventory count vs system count, with a variance report --
-- "kurimira makudo" (stock quietly walking out the back door) only shows
-- up when someone actually counts the shelf and compares it to what the
-- system thinks is there. Finalizing applies a RELATIVE delta
-- (counted - system_qty_when_counted), not an absolute SET, so a real sale
-- or stock receipt that happens between counting and finalizing isn't
-- silently undone -- the same reasoning that drove the updateProduct fix
-- in this same batch.

CREATE TABLE IF NOT EXISTS public.stock_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  note TEXT,
  started_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.stock_take_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_take_id UUID NOT NULL REFERENCES public.stock_takes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  system_qty NUMERIC NOT NULL,
  counted_qty NUMERIC NOT NULL,
  note TEXT,
  counted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  counted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stock_take_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_takes_tenant ON public.stock_takes(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_take_counts_take ON public.stock_take_counts(stock_take_id);

ALTER TABLE public.stock_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_take_counts ENABLE ROW LEVEL SECURITY;

-- Read access for anyone on the floor (they need to see the session
-- they're counting into); starting/finalizing are role-gated in the RPCs
-- below, not here -- counting itself is intentionally open to
-- cashier/shop_assistant too (real stock-takes are usually counted by
-- whoever's on the floor while a manager finalizes).
DROP POLICY IF EXISTS "stock_takes_tenant_read" ON public.stock_takes;
CREATE POLICY "stock_takes_tenant_read" ON public.stock_takes FOR SELECT
  USING (tenant_id = get_user_tenant_id());
DROP POLICY IF EXISTS "stock_take_counts_tenant_read" ON public.stock_take_counts;
CREATE POLICY "stock_take_counts_tenant_read" ON public.stock_take_counts FOR SELECT
  USING (tenant_id = get_user_tenant_id());
-- All writes go through the RPCs below (SECURITY DEFINER) -- no direct
-- INSERT/UPDATE policy on either table.

CREATE OR REPLACE FUNCTION public.start_stock_take(p_tenant_id UUID, p_branch_id UUID, p_note TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; v_id UUID;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to start a stock take';
  END IF;

  INSERT INTO public.stock_takes (tenant_id, branch_id, note, started_by)
  VALUES (p_tenant_id, p_branch_id, p_note, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.start_stock_take(UUID, UUID, TEXT) TO authenticated;

-- Upserts one product's count into an open session. system_qty is
-- snapshotted only the FIRST time a product is counted in this session --
-- re-counting it (a correction) updates counted_qty without re-snapshotting
-- system_qty, so the variance stays measured against the same baseline.
CREATE OR REPLACE FUNCTION public.record_stock_take_count(
  p_stock_take_id UUID, p_product_id UUID, p_counted_qty NUMERIC, p_note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_id UUID; v_status TEXT; v_system_qty NUMERIC; v_existing_system_qty NUMERIC;
BEGIN
  IF p_counted_qty IS NULL OR p_counted_qty < 0 THEN
    RAISE EXCEPTION 'Counted quantity cannot be negative';
  END IF;

  SELECT tenant_id, status INTO v_tenant_id, v_status FROM public.stock_takes
  WHERE id = p_stock_take_id AND tenant_id = get_user_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Stock take not found'; END IF;
  IF v_status != 'open' THEN RAISE EXCEPTION 'This stock take is already completed'; END IF;

  SELECT system_qty INTO v_existing_system_qty FROM public.stock_take_counts
  WHERE stock_take_id = p_stock_take_id AND product_id = p_product_id;

  IF v_existing_system_qty IS NULL THEN
    SELECT COALESCE(stock_qty, 0) INTO v_system_qty FROM public.products
    WHERE id = p_product_id AND tenant_id = v_tenant_id;
    IF v_system_qty IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  ELSE
    v_system_qty := v_existing_system_qty;
  END IF;

  INSERT INTO public.stock_take_counts (stock_take_id, tenant_id, product_id, system_qty, counted_qty, note, counted_by)
  VALUES (p_stock_take_id, v_tenant_id, p_product_id, v_system_qty, p_counted_qty, p_note, auth.uid())
  ON CONFLICT (stock_take_id, product_id)
  DO UPDATE SET counted_qty = p_counted_qty, note = p_note, counted_by = auth.uid(), counted_at = NOW();

  RETURN jsonb_build_object('system_qty', v_system_qty, 'counted_qty', p_counted_qty, 'variance', p_counted_qty - v_system_qty);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_stock_take_count(UUID, UUID, NUMERIC, TEXT) TO authenticated;

-- Applies every counted line's delta (counted - system_qty_when_counted) on
-- top of whatever stock_qty is RIGHT NOW, not a blind overwrite -- a sale
-- or receipt that happened since counting started is preserved.
CREATE OR REPLACE FUNCTION public.finalize_stock_take(p_stock_take_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT; v_tenant_id UUID; v_status TEXT; v_line RECORD; v_lines_applied INT := 0;
BEGIN
  caller_role := get_user_role();
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to finalize a stock take';
  END IF;

  SELECT tenant_id, status INTO v_tenant_id, v_status FROM public.stock_takes
  WHERE id = p_stock_take_id AND tenant_id = get_user_tenant_id();
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Stock take not found'; END IF;
  IF v_status != 'open' THEN RAISE EXCEPTION 'This stock take is already completed'; END IF;

  FOR v_line IN
    SELECT product_id, counted_qty, system_qty FROM public.stock_take_counts WHERE stock_take_id = p_stock_take_id
  LOOP
    UPDATE public.products
    SET stock_qty = GREATEST(0, stock_qty + (v_line.counted_qty - v_line.system_qty)), updated_at = NOW()
    WHERE id = v_line.product_id AND tenant_id = v_tenant_id;
    v_lines_applied := v_lines_applied + 1;
  END LOOP;

  UPDATE public.stock_takes SET status = 'completed', completed_by = auth.uid(), completed_at = NOW()
  WHERE id = p_stock_take_id;

  INSERT INTO public.tenant_activity_log (tenant_id, actor_id, action, details)
  VALUES (v_tenant_id, auth.uid(), 'stock_take_completed', jsonb_build_object('stock_take_id', p_stock_take_id, 'products_counted', v_lines_applied));

  RETURN jsonb_build_object('products_counted', v_lines_applied);
END;
$$;
GRANT EXECUTE ON FUNCTION public.finalize_stock_take(UUID) TO authenticated;
