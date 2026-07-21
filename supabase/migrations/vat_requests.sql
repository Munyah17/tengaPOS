-- VAT becomes a platform-gated request, same shape as Fiscalisation but
-- free (no pricing/payment — it's a tax/compliance status, not a paid
-- add-on): Vendor requests, Super Admin/Admin approves or rejects with one
-- click, tenants.features.vat marks it unlocked. Once unlocked, the Vendor
-- can freely toggle vat_enabled on/off day-to-day (same pattern as
-- fiscalisation's is_enabled toggle needing fiscalUnlocked first).
CREATE TABLE IF NOT EXISTS public.vat_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vat_number TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by UUID
);

ALTER TABLE public.vat_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_manage_vat_requests ON public.vat_requests;
CREATE POLICY app_users_manage_vat_requests ON public.vat_requests
  FOR ALL USING (is_active_app_user()) WITH CHECK (is_active_app_user());

DROP POLICY IF EXISTS tenant_manage_own_vat_requests ON public.vat_requests;
CREATE POLICY tenant_manage_own_vat_requests ON public.vat_requests
  FOR ALL
  USING (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.id = auth.uid()));
