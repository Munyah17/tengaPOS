-- Accounting & ERP buildout: Suppliers + Fixed/Moving Assets management.
-- Same tenant-scoped RLS pattern as documents.sql/customers throughout.

CREATE TABLE IF NOT EXISTS public.suppliers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON public.suppliers(tenant_id, name);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_tenant_access" ON public.suppliers;
CREATE POLICY "suppliers_tenant_access"
  ON public.suppliers FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

-- Book value / depreciation computed client-side (straight-line) from cost,
-- salvage_value, useful_life_years and purchase_date -- no stored schedule
-- table, same "compute on read" style as invoice_payments balances.
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  category          TEXT,
  asset_type        TEXT NOT NULL DEFAULT 'fixed' CHECK (asset_type IN ('fixed', 'moving')),
  purchase_date     DATE NOT NULL,
  cost              NUMERIC NOT NULL CHECK (cost >= 0),
  salvage_value     NUMERIC NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_years NUMERIC NOT NULL CHECK (useful_life_years > 0),
  custodian         TEXT,
  location          TEXT,
  disposed_at       DATE,
  disposal_value    NUMERIC,
  notes             TEXT,
  created_by        UUID REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant ON public.fixed_assets(tenant_id, created_at DESC);

ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fixed_assets_tenant_access" ON public.fixed_assets;
CREATE POLICY "fixed_assets_tenant_access"
  ON public.fixed_assets FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
