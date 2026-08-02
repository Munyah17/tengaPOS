-- Accounting & ERP buildout: Expenses, Petty Cash, Cash Management (Cash at
-- Hand / Cash at Bank). All transaction-log style -- running balances are
-- computed client-side (sum of rows), not stored, same style as
-- invoice_payments balances elsewhere in this app.

CREATE TABLE IF NOT EXISTS public.expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id      UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  expense_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  category       TEXT NOT NULL,
  description    TEXT,
  amount         NUMERIC NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  supplier_id    UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_by     UUID REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON public.expenses(tenant_id, expense_date DESC);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "expenses_tenant_access" ON public.expenses;
CREATE POLICY "expenses_tenant_access"
  ON public.expenses FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE TABLE IF NOT EXISTS public.petty_cash_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN ('topup', 'expense')),
  amount      NUMERIC NOT NULL CHECK (amount > 0),
  description TEXT,
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_tenant ON public.petty_cash_transactions(tenant_id, created_at DESC);

ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "petty_cash_tenant_access" ON public.petty_cash_transactions;
CREATE POLICY "petty_cash_tenant_access"
  ON public.petty_cash_transactions FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

-- account = 'hand' | 'bank'. type = 'deposit' | 'withdrawal' | 'transfer'.
-- A transfer sets to_account to the other account -- balance per account is
-- computed client-side: deposits + transfers-in (to_account = X) minus
-- withdrawals + transfers-out (account = X).
CREATE TABLE IF NOT EXISTS public.cash_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  account     TEXT NOT NULL CHECK (account IN ('hand', 'bank')),
  type        TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'transfer')),
  to_account  TEXT CHECK (to_account IN ('hand', 'bank')),
  amount      NUMERIC NOT NULL CHECK (amount > 0),
  description TEXT,
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_tenant ON public.cash_transactions(tenant_id, created_at DESC);

ALTER TABLE public.cash_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cash_transactions_tenant_access" ON public.cash_transactions;
CREATE POLICY "cash_transactions_tenant_access"
  ON public.cash_transactions FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
