-- Void Transaction workflow: any staff member can request a void (sale
-- completed but the customer refused/failed to pay/etc.), Shop Manager or
-- Supervisor can approve it (on-the-ground support), but only the Vendor
-- can give final validation — which is the point stock actually gets
-- restored and the sale is marked voided. Nothing reverses until validated.

CREATE TABLE IF NOT EXISTS public.voids (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id          UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'validated', 'rejected')),
  reason            TEXT NOT NULL,
  requested_by      UUID REFERENCES public.users(id),
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by       UUID REFERENCES public.users(id),
  approved_at       TIMESTAMPTZ,
  validated_by      UUID REFERENCES public.users(id),
  validated_at      TIMESTAMPTZ,
  rejected_by       UUID REFERENCES public.users(id),
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.voids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voids_select_same_tenant" ON public.voids;
CREATE POLICY "voids_select_same_tenant"
  ON public.voids FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_active_app_user());

-- All actual state transitions happen through the SECURITY DEFINER
-- functions below (each checks its own role requirement), so direct table
-- writes are locked down to select-only for tenant users.

-- ─── request_void: any staff member on their own tenant's order ───────────
CREATE OR REPLACE FUNCTION public.request_void(p_order_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_id UUID;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required to request a void';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.orders
  WHERE id = p_order_id AND tenant_id = get_user_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.voids
    WHERE order_id = p_order_id AND status IN ('requested', 'approved', 'validated')
  ) THEN
    RAISE EXCEPTION 'A void is already pending or completed for this order';
  END IF;

  INSERT INTO public.voids (tenant_id, order_id, reason, requested_by)
  VALUES (v_tenant_id, p_order_id, p_reason, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── approve_void: Shop Manager or Supervisor (or Vendor) ─────────────────
CREATE OR REPLACE FUNCTION public.approve_void(p_void_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF get_user_role() NOT IN ('shop_manager', 'supervisor', 'vendor') THEN
    RAISE EXCEPTION 'Only a Shop Manager, Supervisor, or Vendor can approve a void';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.voids
  WHERE id = p_void_id AND tenant_id = get_user_tenant_id() AND status = 'requested';

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Void request not found or not awaiting approval';
  END IF;

  UPDATE public.voids
  SET status = 'approved', approved_by = auth.uid(), approved_at = NOW()
  WHERE id = p_void_id;
END;
$$;

-- ─── validate_void: Vendor only — this is the step that actually reverses
--     the sale (restores stock, marks the order voided) ──────────────────
CREATE OR REPLACE FUNCTION public.validate_void(p_void_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  IF get_user_role() != 'vendor' THEN
    RAISE EXCEPTION 'Only the Vendor can give final validation on a void';
  END IF;

  SELECT order_id INTO v_order_id FROM public.voids
  WHERE id = p_void_id AND tenant_id = get_user_tenant_id() AND status = 'approved';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Void request not found or not awaiting validation';
  END IF;

  -- Restore stock for every line on the voided order
  UPDATE public.products p
  SET stock_qty = p.stock_qty + oi.qty, updated_at = NOW()
  FROM public.order_items oi
  WHERE oi.order_id = v_order_id AND oi.product_id = p.id;

  UPDATE public.orders SET status = 'voided', updated_at = NOW() WHERE id = v_order_id;

  UPDATE public.voids
  SET status = 'validated', validated_by = auth.uid(), validated_at = NOW()
  WHERE id = p_void_id;
END;
$$;

-- ─── reject_void: Shop Manager, Supervisor, or Vendor ──────────────────────
CREATE OR REPLACE FUNCTION public.reject_void(p_void_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF get_user_role() NOT IN ('shop_manager', 'supervisor', 'vendor') THEN
    RAISE EXCEPTION 'Only a Shop Manager, Supervisor, or Vendor can reject a void';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.voids
  WHERE id = p_void_id AND tenant_id = get_user_tenant_id() AND status IN ('requested', 'approved');

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Void request not found or already resolved';
  END IF;

  UPDATE public.voids
  SET status = 'rejected', rejected_by = auth.uid(), rejected_at = NOW(), rejection_reason = p_reason
  WHERE id = p_void_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_void(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_void(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_void(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_void(UUID, TEXT) TO authenticated;
