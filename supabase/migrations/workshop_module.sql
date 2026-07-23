-- Workshop Mode's data model: customers, their vehicles, and job cards
-- (customer comes in -> job card opened -> work done -> job card completed,
-- which issues a receipt through the same order/checkout pipeline every
-- other mode already uses). Same RLS template as documents.sql:
-- get_user_tenant_id()/get_user_role(), one FOR ALL policy per table.

-- `customers` is tenant-wide, not workshop-only -- the first real customer
-- entity in the app (today Orders/documents just use free-text names), so
-- retail/restaurant tenants can use it too later without a schema change.
CREATE TABLE IF NOT EXISTS public.customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id, name);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_tenant_access" ON public.customers;
CREATE POLICY "customers_tenant_access"
  ON public.customers FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']));

CREATE TABLE IF NOT EXISTS public.vehicles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  make        TEXT,
  model       TEXT,
  year        TEXT,
  reg_number  TEXT,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant ON public.vehicles(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_reg ON public.vehicles(tenant_id, reg_number);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vehicles_tenant_access" ON public.vehicles;
CREATE POLICY "vehicles_tenant_access"
  ON public.vehicles FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']));

CREATE TABLE IF NOT EXISTS public.job_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  vehicle_id      UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  job_card_no     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  description     TEXT,
  mileage_in      INTEGER,
  -- [{ description, qty, unit_price, product_id? }] -- same shape as
  -- documents.items; a line with product_id is a stocked part (decrements
  -- inventory on completion), a line without one is labor/a custom charge.
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal        NUMERIC NOT NULL DEFAULT 0,
  vat_amount      NUMERIC NOT NULL DEFAULT 0,
  total           NUMERIC NOT NULL DEFAULT 0,
  recommendations TEXT,
  assigned_to     UUID REFERENCES public.users(id),
  created_by      UUID REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  linked_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, job_card_no)
);
CREATE INDEX IF NOT EXISTS idx_job_cards_tenant ON public.job_cards(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_cards_vehicle ON public.job_cards(vehicle_id, created_at DESC);

ALTER TABLE public.job_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_cards_tenant_access" ON public.job_cards;
CREATE POLICY "job_cards_tenant_access"
  ON public.job_cards FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']));
