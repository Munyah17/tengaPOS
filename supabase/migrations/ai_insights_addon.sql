-- AI Insights paid add-on ($1/month base, scaled by period like
-- Fiscalisation): Vendor requests, pays online (auto-activates via the
-- existing signup-checkout/webhook plumbing) or pays cash (Super Admin
-- approves manually). Mirrors fiscalisation_requests exactly.
CREATE TABLE IF NOT EXISTS public.ai_insights_requests (
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

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS ai_insights_expires_at TIMESTAMPTZ;

ALTER TABLE public.ai_insights_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_manage_ai_insights_requests ON public.ai_insights_requests;
CREATE POLICY app_users_manage_ai_insights_requests ON public.ai_insights_requests
  FOR ALL USING (is_active_app_user()) WITH CHECK (is_active_app_user());

DROP POLICY IF EXISTS tenant_manage_own_ai_insights_requests ON public.ai_insights_requests;
CREATE POLICY tenant_manage_own_ai_insights_requests ON public.ai_insights_requests
  FOR ALL
  USING (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT users.tenant_id FROM public.users WHERE users.id = auth.uid()));
