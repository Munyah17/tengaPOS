-- Paynow integration: payment sessions + per-tenant credentials
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Add Paynow credentials to tenants (vendor manages their own Paynow account)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS paynow_integration_id   TEXT,
  ADD COLUMN IF NOT EXISTS paynow_integration_key  TEXT;

-- 2. Payment sessions — created when a checkout is initiated, updated by callback
CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reference         TEXT        NOT NULL UNIQUE,
  amount            NUMERIC(10, 2) NOT NULL,
  paynow_reference  TEXT,
  browser_url       TEXT,
  poll_url          TEXT,
  status            TEXT        NOT NULL DEFAULT 'pending',
  -- pending | awaiting_delivery | paid | failed | cancelled
  order_data        JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_sessions_reference  ON public.payment_sessions(reference);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_tenant_id  ON public.payment_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_status     ON public.payment_sessions(status);

-- RLS
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;

-- Tenant users read their own sessions (for the return page)
CREATE POLICY "tenant_read_own_sessions"
  ON public.payment_sessions FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Edge functions use service_role key — bypass RLS for insert/update
-- (service_role implicitly bypasses RLS, these policies satisfy PostgREST)
CREATE POLICY "service_insert_sessions"
  ON public.payment_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "service_update_sessions"
  ON public.payment_sessions FOR UPDATE
  USING (true);
