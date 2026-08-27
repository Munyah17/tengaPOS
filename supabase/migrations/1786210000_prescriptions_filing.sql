-- Today's `prescription_dispenses` is a post-sale compliance log line, not
-- a filed prescription -- prescriber details are three free-text fields
-- typed fresh at every checkout, with no independent record a pharmacist
-- can search or reference before a sale happens. This adds the actual
-- filed-prescription artifact; dispensing can optionally reference one
-- once it exists, but walk-in scripts with no pre-filed record keep
-- working exactly as before (the new FK is nullable, purely additive).
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  patient_name TEXT,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  doctor_name TEXT,
  prescription_date DATE,
  image_path TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dispensed', 'expired', 'cancelled')),
  -- Reserved for a future health263.system sync -- inert today, no code
  -- reads or sets this to true anywhere yet.
  synced_to_health263 BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant_date ON public.prescriptions(tenant_id, created_at DESC);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- Whoever can dispense can also file -- same staff set as
-- prescription_dispenses' existing RLS, unlike doctors' narrower write set.
DROP POLICY IF EXISTS "prescriptions_access" ON public.prescriptions;
CREATE POLICY "prescriptions_access"
  ON public.prescriptions
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));

-- Optional link from a dispense back to the filed prescription it fulfilled.
ALTER TABLE public.prescription_dispenses
  ADD COLUMN IF NOT EXISTS prescription_id UUID REFERENCES public.prescriptions(id) ON DELETE SET NULL;
