-- ============================================================
-- SIGNUP CHECKOUT + 7-DAY FREE TRIAL
-- Idempotent: safe to re-run.
--
--  - trial_ends_at on tenants (7-day free trial window)
--  - subscription_payments: platform revenue records, written by
--    payment webhooks (Stripe / Paynow) via service role
--  - signup_checkouts: one row per hosted-checkout redirect, so
--    webhooks can map a provider session back to a tenant
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- ─── Signup / subscription checkout sessions ───

CREATE TABLE IF NOT EXISTS public.signup_checkouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_type          TEXT NOT NULL
    CHECK (plan_type IN ('byod_monthly', 'standard_plan', 'pro_package', 'business', 'enterprise')),
  provider           TEXT NOT NULL CHECK (provider IN ('stripe', 'paynow')),
  provider_session_id TEXT,
  reference          TEXT NOT NULL UNIQUE,
  amount             NUMERIC(10,2) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USD',
  status             TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'redirected', 'paid', 'trialing', 'failed', 'cancelled')),
  poll_url           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_checkouts_tenant ON public.signup_checkouts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_signup_checkouts_ref    ON public.signup_checkouts(reference);

ALTER TABLE public.signup_checkouts ENABLE ROW LEVEL SECURITY;

-- Tenant users see their own checkout sessions (for the return page)
DROP POLICY IF EXISTS "tenant_read_own_signup_checkouts" ON public.signup_checkouts;
CREATE POLICY "tenant_read_own_signup_checkouts"
  ON public.signup_checkouts FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- Platform staff see all
DROP POLICY IF EXISTS "app_users_read_signup_checkouts" ON public.signup_checkouts;
CREATE POLICY "app_users_read_signup_checkouts"
  ON public.signup_checkouts FOR SELECT
  USING (public.is_active_app_user());

-- ─── Subscription payments (webhook-written revenue records) ───

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  checkout_id  UUID REFERENCES public.signup_checkouts(id),
  provider     TEXT NOT NULL CHECK (provider IN ('stripe', 'paynow')),
  provider_ref TEXT,
  plan_type    TEXT,
  amount       NUMERIC(10,2) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  paid_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_payments_tenant ON public.subscription_payments(tenant_id);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Platform staff read all payments (Billing & Revenue page)
DROP POLICY IF EXISTS "app_users_read_subscription_payments" ON public.subscription_payments;
CREATE POLICY "app_users_read_subscription_payments"
  ON public.subscription_payments FOR SELECT
  USING (public.is_active_app_user());

-- Tenants read their own payment history
DROP POLICY IF EXISTS "tenant_read_own_subscription_payments" ON public.subscription_payments;
CREATE POLICY "tenant_read_own_subscription_payments"
  ON public.subscription_payments FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );
