-- Corrects a naming mistake: "Accounting & CRM" should have been
-- "Accounting & ERP" (CRM was used by mistake). No live data exists under
-- the old names yet, so this is a clean rename.
ALTER TABLE IF EXISTS public.accounting_crm_requests RENAME TO accounting_erp_requests;
ALTER TABLE public.tenants RENAME COLUMN accounting_crm_expires_at TO accounting_erp_expires_at;

-- Defensive: migrate the feature flag key too, in case anything was set
-- between the naming decision and this fix.
UPDATE public.tenants
SET features = (features - 'accounting_crm') || jsonb_build_object('accounting_erp', features->'accounting_crm')
WHERE features ? 'accounting_crm';

ALTER POLICY app_users_manage_accounting_crm_requests ON public.accounting_erp_requests RENAME TO app_users_manage_accounting_erp_requests;
ALTER POLICY tenant_manage_own_accounting_crm_requests ON public.accounting_erp_requests RENAME TO tenant_manage_own_accounting_erp_requests;
