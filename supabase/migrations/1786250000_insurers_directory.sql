-- Insurer/medical-aid contact directory -- identical shape and RLS to
-- `suppliers` (1785820000_erp_suppliers_assets.sql), the closest existing
-- analog for a simple tenant-scoped contact entity. Directory only, no
-- claims-status workflow table: there's no real partner integration to
-- drive one yet, so this is a quick-reference for a staff member calling
-- to verify a member/claim, not a tracked pipeline.
CREATE TABLE IF NOT EXISTS public.insurers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  claims_contact_name TEXT,
  claims_contact_phone TEXT,
  claims_contact_email TEXT,
  member_verification_phone TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurers_tenant_name ON public.insurers(tenant_id, name);

ALTER TABLE public.insurers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insurers_tenant_access" ON public.insurers;
CREATE POLICY "insurers_tenant_access" ON public.insurers FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

-- A patient's medical-aid membership, one click from their insurer's
-- verification contact -- without a claims-status table this pass.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS medical_aid_provider TEXT,
  ADD COLUMN IF NOT EXISTS medical_aid_number TEXT,
  ADD COLUMN IF NOT EXISTS insurer_id UUID REFERENCES public.insurers(id) ON DELETE SET NULL;
