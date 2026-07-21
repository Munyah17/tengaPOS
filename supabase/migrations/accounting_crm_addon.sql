-- "Accounting & CRM" paid add-on ($5/month flat) — houses HR & Payroll and
-- Invoicing under one bundle instead of HR & Payroll's earlier standalone
-- per-person pricing. Same request -> pay online (auto-activate) or pay
-- cash (Super Admin approves) flow as Fiscalisation/AI Insights.
CREATE TABLE IF NOT EXISTS public.accounting_crm_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  method TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by UUID
);

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS accounting_crm_expires_at TIMESTAMPTZ;

ALTER TABLE public.accounting_crm_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_manage_accounting_crm_requests ON public.accounting_crm_requests;
CREATE POLICY app_users_manage_accounting_crm_requests ON public.accounting_crm_requests
  FOR ALL USING (is_active_app_user()) WITH CHECK (is_active_app_user());

DROP POLICY IF EXISTS tenant_manage_own_accounting_crm_requests ON public.accounting_crm_requests;
CREATE POLICY tenant_manage_own_accounting_crm_requests ON public.accounting_crm_requests
  FOR ALL
  USING (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.id = auth.uid()));

-- Continuity: any tenant already granted the old standalone HR & Payroll
-- add-on keeps access under the new bundle instead of losing it.
UPDATE public.tenants
SET features = features || '{"accounting_crm": true}'::jsonb,
    accounting_crm_expires_at = COALESCE(accounting_crm_expires_at, hr_payroll_expires_at)
WHERE COALESCE(features->>'hr_payroll', 'false') = 'true';
