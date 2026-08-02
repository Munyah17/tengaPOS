-- Accounting & ERP buildout: bank reconciliation. Manual click-to-match
-- against Cash Management's cash_transactions (account='bank') rows -- no
-- auto-matching algorithm in this pass.

CREATE TABLE IF NOT EXISTS public.bank_reconciliations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id               UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  statement_start_date    DATE NOT NULL,
  statement_end_date      DATE NOT NULL,
  statement_closing_balance NUMERIC NOT NULL,
  reconciled              BOOLEAN NOT NULL DEFAULT false,
  created_by              UUID REFERENCES public.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_tenant ON public.bank_reconciliations(tenant_id, created_at DESC);

ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_reconciliations_tenant_access" ON public.bank_reconciliations;
CREATE POLICY "bank_reconciliations_tenant_access"
  ON public.bank_reconciliations FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reconciliation_id           UUID NOT NULL REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE,
  line_date                   DATE NOT NULL,
  description                 TEXT,
  amount                      NUMERIC NOT NULL,
  matched                     BOOLEAN NOT NULL DEFAULT false,
  matched_cash_transaction_id UUID REFERENCES public.cash_transactions(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_reconciliation ON public.bank_statement_lines(reconciliation_id);

ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bank_statement_lines_tenant_access" ON public.bank_statement_lines;
CREATE POLICY "bank_statement_lines_tenant_access"
  ON public.bank_statement_lines FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
