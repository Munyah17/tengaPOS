-- Simple direct-CRUD workflow, not the strict void/return SECURITY-DEFINER
-- pattern -- booking/cancelling an appointment has no money or stock side
-- effects, so this matches `requisitions`' lighter shape instead.
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  patient_name TEXT,
  doctor_id UUID REFERENCES public.doctors(id) ON DELETE SET NULL,
  purpose TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'confirmed', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_scheduled ON public.appointments(tenant_id, scheduled_at);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Same staff set as prescription_dispenses -- anyone dispensing can also
-- book/manage appointments.
DROP POLICY IF EXISTS "appointments_access" ON public.appointments;
CREATE POLICY "appointments_access"
  ON public.appointments
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));
