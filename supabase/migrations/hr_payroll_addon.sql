-- HR & Payroll paid add-on ($5/person/month). Mirrors the fiscalisation
-- request → admin-approve → unlock flow exactly (fiscalisation_requests,
-- tenants.features.fiscalisation): headcount is only used to quote a price;
-- once approved, the module unlocks for the whole tenant (no seat cap
-- enforcement).
CREATE TABLE IF NOT EXISTS public.hr_payroll_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  headcount INTEGER NOT NULL,
  period TEXT NOT NULL,
  method TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by UUID
);

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS hr_payroll_expires_at TIMESTAMPTZ;

ALTER TABLE public.hr_payroll_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_manage_hr_payroll_requests ON public.hr_payroll_requests;
CREATE POLICY app_users_manage_hr_payroll_requests ON public.hr_payroll_requests
  FOR ALL USING (is_active_app_user()) WITH CHECK (is_active_app_user());

DROP POLICY IF EXISTS tenant_manage_own_hr_payroll_requests ON public.hr_payroll_requests;
CREATE POLICY tenant_manage_own_hr_payroll_requests ON public.hr_payroll_requests
  FOR ALL
  USING (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.id = auth.uid()));
