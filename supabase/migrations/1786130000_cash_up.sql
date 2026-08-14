-- Daily cash-drawer reconciliation. Scope confirmed: one open cash-up per
-- branch per day (not per-cashier-per-shift) -- matches how most small
-- Zimbabwean retail shops actually run one shared till. Optional/
-- non-blocking by design: nothing here gates POS access on having an open
-- cash-up, only a nav badge/dashboard nudge -- locking staff out of
-- selling because nobody opened a float yet would be a worse problem than
-- the one this solves.

CREATE TABLE IF NOT EXISTS public.cash_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES public.staff_shifts(id) ON DELETE SET NULL,
  opened_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opening_float NUMERIC NOT NULL CHECK (opening_float >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  counted_cash NUMERIC,
  expected_cash NUMERIC,
  discrepancy NUMERIC,
  discrepancy_flagged BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_ups_tenant ON public.cash_ups(tenant_id, opened_at DESC);

ALTER TABLE public.cash_ups ENABLE ROW LEVEL SECURITY;

-- Two permissive policies OR'd together (Postgres combines permissive
-- policies on the same command with OR): managers see every cash-up in
-- the tenant, and anyone sees/closes their own -- no restrictive policy
-- needed for "managers see everything, everyone sees their own".
DROP POLICY IF EXISTS "cash_ups_manager_access" ON public.cash_ups;
CREATE POLICY "cash_ups_manager_access" ON public.cash_ups FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
DROP POLICY IF EXISTS "cash_ups_own_access" ON public.cash_ups;
CREATE POLICY "cash_ups_own_access" ON public.cash_ups FOR ALL
  USING (tenant_id = get_user_tenant_id() AND opened_by = auth.uid());

CREATE OR REPLACE FUNCTION public.open_cash_up(
  p_tenant_id UUID, p_branch_id UUID, p_opening_float NUMERIC, p_shift_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; v_id UUID;
BEGIN
  SELECT tenant_id INTO caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF p_opening_float IS NULL OR p_opening_float < 0 THEN
    RAISE EXCEPTION 'Opening float cannot be negative';
  END IF;

  INSERT INTO public.cash_ups (tenant_id, branch_id, shift_id, opened_by, opening_float)
  VALUES (p_tenant_id, p_branch_id, p_shift_id, auth.uid(), p_opening_float)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.open_cash_up(UUID, UUID, NUMERIC, UUID) TO authenticated;

-- expected_cash is computed server-side, never trusted from the client:
-- every completed cash sale since this cash-up opened, minus every refund
-- transaction in the same window (refunds reduce expected cash
-- unconditionally, regardless of the original sale's payment method --
-- confirmed default: most small shops refund in cash regardless).
CREATE OR REPLACE FUNCTION public.close_cash_up(p_cash_up_id UUID, p_counted_cash NUMERIC, p_notes TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row RECORD; v_cash_sales NUMERIC; v_refunds NUMERIC; v_expected NUMERIC; v_discrepancy NUMERIC; v_flagged BOOLEAN;
BEGIN
  SELECT * INTO v_row FROM public.cash_ups
  WHERE id = p_cash_up_id AND tenant_id = get_user_tenant_id() AND status = 'open'
  FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Cash-up not found or already closed'; END IF;
  IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN RAISE EXCEPTION 'Counted cash cannot be negative'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_cash_sales FROM public.transactions
  WHERE tenant_id = v_row.tenant_id AND status = 'completed' AND type = 'sale' AND method = 'cash'
    AND created_at >= v_row.opened_at
    AND (v_row.branch_id IS NULL OR branch_id = v_row.branch_id);

  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_refunds FROM public.transactions
  WHERE tenant_id = v_row.tenant_id AND status = 'completed' AND type = 'refund'
    AND created_at >= v_row.opened_at
    AND (v_row.branch_id IS NULL OR branch_id = v_row.branch_id);

  v_expected := v_row.opening_float + v_cash_sales - v_refunds;
  v_discrepancy := p_counted_cash - v_expected;
  v_flagged := ABS(v_discrepancy) > GREATEST(5, v_expected * 0.03);

  UPDATE public.cash_ups
  SET status = 'closed', closed_by = auth.uid(), closed_at = NOW(),
      counted_cash = p_counted_cash, expected_cash = v_expected,
      discrepancy = v_discrepancy, discrepancy_flagged = v_flagged, notes = p_notes
  WHERE id = p_cash_up_id;

  IF v_flagged THEN
    INSERT INTO public.tenant_activity_log (tenant_id, actor_id, action, details)
    VALUES (v_row.tenant_id, auth.uid(), 'cash_up_discrepancy', jsonb_build_object(
      'cash_up_id', p_cash_up_id, 'expected_cash', v_expected, 'counted_cash', p_counted_cash, 'discrepancy', v_discrepancy
    ));
  END IF;

  RETURN jsonb_build_object('expected_cash', v_expected, 'discrepancy', v_discrepancy, 'flagged', v_flagged);
END;
$$;
GRANT EXECUTE ON FUNCTION public.close_cash_up(UUID, NUMERIC, TEXT) TO authenticated;
