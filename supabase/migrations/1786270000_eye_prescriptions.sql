-- Optometry is a genuinely different clinical domain from medicine
-- dispensing -- filed and queried on its own this pass, deliberately not
-- wired into POS checkout yet (an eyewear sale today is just a normal
-- product sale; linking it to a filed eye prescription is a natural next
-- step, not needed to deliver filing/querying itself).
CREATE TABLE IF NOT EXISTS public.eye_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  patient_name TEXT,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  od_sphere NUMERIC(5,2), od_cylinder NUMERIC(5,2), od_axis INT, od_add NUMERIC(5,2),
  os_sphere NUMERIC(5,2), os_cylinder NUMERIC(5,2), os_axis INT, os_add NUMERIC(5,2),
  pd NUMERIC(5,2),
  prescription_date DATE,
  expiry_date DATE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eye_prescriptions_tenant_date ON public.eye_prescriptions(tenant_id, created_at DESC);

ALTER TABLE public.eye_prescriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eye_prescriptions_access" ON public.eye_prescriptions;
CREATE POLICY "eye_prescriptions_access"
  ON public.eye_prescriptions
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));
