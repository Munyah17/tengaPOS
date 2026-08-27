-- Doctors are non-login master data, same as workshop's `technicians` --
-- they never sign in, so this is a plain tenant-scoped directory, not a
-- new auth role. Read is broad (dispensing staff need to pick a doctor
-- when filing/dispensing a prescription); write is narrower (directory
-- management stays a manager-level action), matching the split already
-- used for discount_authorizations/prescription_dispenses.
CREATE TABLE IF NOT EXISTS public.doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  license_no TEXT,
  specialty TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_tenant_name ON public.doctors(tenant_id, name);

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctors_read" ON public.doctors;
CREATE POLICY "doctors_read"
  ON public.doctors
  FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));

DROP POLICY IF EXISTS "doctors_write" ON public.doctors;
CREATE POLICY "doctors_write"
  ON public.doctors
  FOR INSERT
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

DROP POLICY IF EXISTS "doctors_update" ON public.doctors;
CREATE POLICY "doctors_update"
  ON public.doctors
  FOR UPDATE
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
