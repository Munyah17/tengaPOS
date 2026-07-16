-- Returns/Refunds workflow — same approval tiers as voids (anyone can
-- request, Shop Manager/Supervisor approve, only Vendor gives final
-- validation), but distinct from a void: a return means goods were
-- actually sold and are now physically coming back, so validating one
-- restores stock AND records a refund transaction (money actually leaving),
-- rather than just reversing an incomplete sale.

CREATE TABLE IF NOT EXISTS public.returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id          UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'validated', 'rejected')),
  reason            TEXT NOT NULL,
  refund_amount     NUMERIC NOT NULL,
  requested_by      UUID REFERENCES public.users(id),
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by       UUID REFERENCES public.users(id),
  approved_at       TIMESTAMPTZ,
  validated_by      UUID REFERENCES public.users(id),
  validated_at      TIMESTAMPTZ,
  rejected_by       UUID REFERENCES public.users(id),
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  refund_transaction_id UUID REFERENCES public.transactions(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "returns_select_same_tenant" ON public.returns;
CREATE POLICY "returns_select_same_tenant"
  ON public.returns FOR SELECT
  USING (tenant_id = get_user_tenant_id() OR is_active_app_user());

-- All state transitions go through the SECURITY DEFINER functions below —
-- no direct INSERT/UPDATE policy, matching the voids table.

CREATE OR REPLACE FUNCTION public.request_return(p_order_id UUID, p_reason TEXT, p_refund_amount NUMERIC)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_order_total NUMERIC;
  v_id UUID;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required to request a return';
  END IF;
  IF p_refund_amount IS NULL OR p_refund_amount <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be greater than zero';
  END IF;

  SELECT tenant_id, total INTO v_tenant_id, v_order_total FROM public.orders
  WHERE id = p_order_id AND tenant_id = get_user_tenant_id();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF p_refund_amount > v_order_total THEN
    RAISE EXCEPTION 'Refund amount cannot exceed the original sale total';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.returns
    WHERE order_id = p_order_id AND status IN ('requested', 'approved', 'validated')
  ) THEN
    RAISE EXCEPTION 'A return is already pending or completed for this order';
  END IF;

  INSERT INTO public.returns (tenant_id, order_id, reason, refund_amount, requested_by)
  VALUES (v_tenant_id, p_order_id, p_reason, p_refund_amount, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_return(p_return_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF get_user_role() NOT IN ('shop_manager', 'supervisor', 'vendor') THEN
    RAISE EXCEPTION 'Only a Shop Manager, Supervisor, or Vendor can approve a return';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.returns
  WHERE id = p_return_id AND tenant_id = get_user_tenant_id() AND status = 'requested';

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Return request not found or not awaiting approval';
  END IF;

  UPDATE public.returns
  SET status = 'approved', approved_by = auth.uid(), approved_at = NOW()
  WHERE id = p_return_id;
END;
$$;

-- ─── validate_return: Vendor only — restores stock and records the refund
CREATE OR REPLACE FUNCTION public.validate_return(p_return_id UUID)
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

  SELECT r.order_id, r.tenant_id, r.refund_amount, o.branch_id
  INTO v_order_id, v_tenant_id, v_refund_amount, v_branch_id
  FROM public.returns r
  JOIN public.orders o ON o.id = r.order_id
  WHERE r.id = p_return_id AND r.tenant_id = get_user_tenant_id() AND r.status = 'approved';

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Return request not found or not awaiting validation';
  END IF;

  -- Restore stock for the returned order's lines
  UPDATE public.products p
  SET stock_qty = p.stock_qty + oi.qty, updated_at = NOW()
  FROM public.order_items oi
  WHERE oi.order_id = v_order_id AND oi.product_id = p.id;

  UPDATE public.orders SET status = 'returned', updated_at = NOW() WHERE id = v_order_id;

  -- Record the refund as its own transaction (negative amount = money out)
  INSERT INTO public.transactions (tenant_id, order_id, branch_id, processed_by, type, method, amount, status, notes)
  VALUES (v_tenant_id, v_order_id, v_branch_id, auth.uid(), 'refund', 'refund', -v_refund_amount, 'completed', 'Refund for returned goods')
  RETURNING id INTO v_tx_id;

  UPDATE public.returns
  SET status = 'validated', validated_by = auth.uid(), validated_at = NOW(), refund_transaction_id = v_tx_id
  WHERE id = p_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_return(p_return_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF get_user_role() NOT IN ('shop_manager', 'supervisor', 'vendor') THEN
    RAISE EXCEPTION 'Only a Shop Manager, Supervisor, or Vendor can reject a return';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.returns
  WHERE id = p_return_id AND tenant_id = get_user_tenant_id() AND status IN ('requested', 'approved');

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Return request not found or already resolved';
  END IF;

  UPDATE public.returns
  SET status = 'rejected', rejected_by = auth.uid(), rejected_at = NOW(), rejection_reason = p_reason
  WHERE id = p_return_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_return(UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_return(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_return(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_return(UUID, TEXT) TO authenticated;
