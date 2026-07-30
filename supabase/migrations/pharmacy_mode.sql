-- Pharmacy Mode: prescription/controlled-substance tracking. A product is
-- tagged with a dispensing_class ('otc' by default -- no change for any
-- existing product) so POS knows when a sale needs prescriber/customer
-- details captured before it can complete. Each dispense is logged
-- separately from the order itself (prescription_dispenses) as the
-- compliance record: who it was dispensed to, who prescribed it, and a
-- snapshot of the product's class/schedule at the time (so changing a
-- product's classification later never rewrites history).

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dispensing_class TEXT NOT NULL DEFAULT 'otc';
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_dispensing_class_check;
ALTER TABLE public.products ADD CONSTRAINT products_dispensing_class_check
  CHECK (dispensing_class IN ('otc', 'prescription', 'controlled'));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS controlled_schedule TEXT;

CREATE TABLE IF NOT EXISTS public.prescription_dispenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  prescriber_name TEXT NOT NULL,
  prescriber_license_no TEXT,
  -- Snapshot of the product's classification at dispense time.
  dispensing_class TEXT NOT NULL,
  controlled_schedule TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescription_dispenses_tenant ON public.prescription_dispenses(tenant_id, created_at DESC);

ALTER TABLE public.prescription_dispenses ENABLE ROW LEVEL SECURITY;

-- Front-counter roles need this (dispensing happens at every qualifying
-- sale, not just a manager-level inventory action) -- same role list as
-- job_cards/vehicles/technicians, including shop_assistant.
DROP POLICY IF EXISTS "prescription_dispenses_tenant_access" ON public.prescription_dispenses;
CREATE POLICY "prescription_dispenses_tenant_access"
  ON public.prescription_dispenses
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));
