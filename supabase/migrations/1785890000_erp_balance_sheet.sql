-- Accounting & ERP buildout: small manual-entry tables backing the Balance
-- Sheet / Statement of Financial Position report -- Liabilities beyond
-- Creditors (e.g. loans) and Equity (e.g. owner's capital), since there's
-- no full ledger tracking these automatically. The report itself is
-- computed client-side from these plus Cash/Assets/Creditors/Debtors.

CREATE TABLE IF NOT EXISTS public.other_liabilities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      NUMERIC NOT NULL CHECK (amount >= 0),
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_other_liabilities_tenant ON public.other_liabilities(tenant_id);

ALTER TABLE public.other_liabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "other_liabilities_tenant_access" ON public.other_liabilities;
CREATE POLICY "other_liabilities_tenant_access"
  ON public.other_liabilities FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE TABLE IF NOT EXISTS public.equity_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount      NUMERIC NOT NULL,
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equity_entries_tenant ON public.equity_entries(tenant_id);

ALTER TABLE public.equity_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equity_entries_tenant_access" ON public.equity_entries;
CREATE POLICY "equity_entries_tenant_access"
  ON public.equity_entries FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
