-- Accounting & ERP buildout: Debtors (Accounts Receivable). Outstanding
-- invoice balances are already auto-derivable from documents +
-- invoice_payments (same aggregation as fetchCustomerStatement). This adds
-- the other half: informal debts not tied to a formal invoice.
CREATE TABLE IF NOT EXISTS public.manual_debtor_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id  UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding', 'settled', 'written_off')),
  created_by   UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_manual_debtor_entries_tenant ON public.manual_debtor_entries(tenant_id, status, created_at DESC);

ALTER TABLE public.manual_debtor_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manual_debtor_entries_tenant_access" ON public.manual_debtor_entries;
CREATE POLICY "manual_debtor_entries_tenant_access"
  ON public.manual_debtor_entries FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
