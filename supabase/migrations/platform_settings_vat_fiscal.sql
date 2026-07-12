-- ============================================================
-- PLATFORM SETTINGS + VAT + FISCALISATION ADD-ON + STOCK SAFETY
-- Idempotent: safe to re-run.
-- ============================================================

-- ─── 1. Platform settings (Super Admin editable, system-wide) ───

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Everyone (including the public landing page) can READ settings —
-- they hold only public values: plan prices, banner text.
DROP POLICY IF EXISTS "public_read_platform_settings" ON public.platform_settings;
CREATE POLICY "public_read_platform_settings"
  ON public.platform_settings FOR SELECT
  USING (true);

-- Only the Super Admin can change them
DROP POLICY IF EXISTS "super_admin_write_platform_settings" ON public.platform_settings;
CREATE POLICY "super_admin_write_platform_settings"
  ON public.platform_settings FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Seed current pricing (ON CONFLICT DO NOTHING so Super Admin edits survive re-runs)
INSERT INTO public.platform_settings (key, value) VALUES
  ('plan_pricing', '{
    "byod_monthly":  {"price": 30,  "recurring": true,  "renewalMonths": 1},
    "standard_plan": {"price": 170, "recurring": false, "renewalMonths": 6},
    "pro_package":   {"price": 200, "recurring": false, "renewalMonths": 6}
  }'),
  ('fiscalisation_pricing', '{
    "monthly":   {"price": 20,  "months": 1,  "label": "Monthly"},
    "quarterly": {"price": 50,  "months": 3,  "label": "3 Months"},
    "halfyear":  {"price": 90,  "months": 6,  "label": "6 Months"},
    "yearly":    {"price": 170, "months": 12, "label": "Yearly"}
  }'),
  ('site_banner', '{"enabled": false, "text": "", "type": "info"}')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. VAT + onboarding per tenant ───

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS vat_enabled     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vat_rate        NUMERIC NOT NULL DEFAULT 15.5,
  ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fiscal_expires_at TIMESTAMPTZ;

-- ─── 3. Product image enforcement support ───

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_unavailable BOOLEAN NOT NULL DEFAULT false;

-- ─── 4. Fiscalisation requests (cash → operator approval) ───

CREATE TABLE IF NOT EXISTS public.fiscalisation_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period     TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'halfyear', 'yearly')),
  method     TEXT NOT NULL CHECK (method IN ('cash', 'online')),
  amount     NUMERIC(10,2) NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by UUID
);

ALTER TABLE public.fiscalisation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_manage_own_fiscal_requests" ON public.fiscalisation_requests;
CREATE POLICY "tenant_manage_own_fiscal_requests"
  ON public.fiscalisation_requests FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "app_users_manage_fiscal_requests" ON public.fiscalisation_requests;
CREATE POLICY "app_users_manage_fiscal_requests"
  ON public.fiscalisation_requests FOR ALL
  USING (public.is_active_app_user())
  WITH CHECK (public.is_active_app_user());

-- ─── 4b. Fiscalisation add-on rows in signup_checkouts ───

ALTER TABLE public.signup_checkouts DROP CONSTRAINT IF EXISTS signup_checkouts_plan_type_check;
ALTER TABLE public.signup_checkouts
  ADD CONSTRAINT signup_checkouts_plan_type_check
  CHECK (plan_type IN (
    'byod_monthly', 'standard_plan', 'pro_package', 'business', 'enterprise',
    'fiscal_monthly', 'fiscal_quarterly', 'fiscal_halfyear', 'fiscal_yearly'
  ));

-- ─── 5. Stock safety: atomic decrement, no oversell ───

CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id UUID, p_qty INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_tenant UUID;
  new_qty INT;
  prod_name TEXT;
BEGIN
  SELECT tenant_id INTO caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL THEN
    RAISE EXCEPTION 'Not a tenant user';
  END IF;
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  UPDATE public.products
  SET stock_qty = stock_qty - p_qty, updated_at = NOW()
  WHERE id = p_product_id
    AND tenant_id = caller_tenant
    AND stock_qty >= p_qty
  RETURNING stock_qty, name INTO new_qty, prod_name;

  IF new_qty IS NULL THEN
    SELECT name INTO prod_name FROM public.products WHERE id = p_product_id AND tenant_id = caller_tenant;
    RAISE EXCEPTION 'Insufficient stock for %', COALESCE(prod_name, 'product');
  END IF;

  RETURN new_qty;
END;
$$;
