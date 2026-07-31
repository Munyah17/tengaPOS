-- Bar/Liquor Store Mode: age-restricted sale compliance, same architecture
-- as Pharmacy Mode's dispensing_class (see pharmacy_mode.sql). A product is
-- tagged age_restricted so POS knows a sale needs ID verification captured
-- before it can complete. Each verification is logged separately from the
-- order (age_verifications) as the compliance record.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS age_restricted BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.age_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  id_type TEXT,
  id_last4 TEXT,
  verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_age_verifications_tenant ON public.age_verifications(tenant_id, created_at DESC);

ALTER TABLE public.age_verifications ENABLE ROW LEVEL SECURITY;

-- Same role list as prescription_dispenses -- verification happens at
-- every qualifying sale, at the till, not just a manager-level action.
DROP POLICY IF EXISTS "age_verifications_tenant_access" ON public.age_verifications;
CREATE POLICY "age_verifications_tenant_access"
  ON public.age_verifications
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));
