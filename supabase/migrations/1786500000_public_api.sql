-- ============================================================
-- PUBLIC API — developer/organisation integration keys
-- Run this ONCE in Supabase Dashboard > SQL Editor.
-- Idempotent: safe to re-run.
--
-- The platform issues two kinds of API keys to authorised
-- developers/organisations so they can integrate their own
-- systems with a tenant's tengaPOS data:
--
--   publishable  (tpos_pk_...)  — safe for client-side/public
--                  use; read-only access to catalogue-style
--                  endpoints only.
--   integration  (tpos_sk_...)  — secret server-side key;
--                  full access within its granted scopes.
--
-- Keys can ONLY be issued by the Super Admin
-- (is_super_admin() RLS gate below — mirrors super_admin_launch).
--
-- Raw keys are never stored — only a SHA-256 hash. The
-- public-api edge function hashes the presented key and
-- compares hashes to authenticate.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which tenant's data this key can access. Every API request is
  -- hard-scoped to this tenant_id inside the edge function.
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Authorised developer / organisation this key was issued to.
  organisation          TEXT NOT NULL,
  contact_name          TEXT,
  contact_email         TEXT,
  label                 TEXT NOT NULL DEFAULT '',
  key_type              TEXT NOT NULL
    CHECK (key_type IN ('publishable', 'integration')),
  -- Identification material shown in the admin UI (never the raw key).
  public_id             TEXT NOT NULL UNIQUE,   -- e.g. tpos_pk_3f9a2c
  key_hash              TEXT NOT NULL UNIQUE,   -- sha256(raw key), hex
  last4                 TEXT NOT NULL,          -- last 4 chars, for display
  -- Fine-grained permissions. Publishable keys are capped to the
  -- read-only scope set inside the edge function regardless.
  scopes                TEXT[] NOT NULL DEFAULT '{}',
  -- Throttle: max requests per rolling 60s window for this key.
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 120
    CHECK (rate_limit_per_minute BETWEEN 1 AND 10000),
  -- Optional CORS allowlist for publishable keys used from browsers.
  allowed_origins       TEXT[],
  status                TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  expires_at            TIMESTAMPTZ,
  last_used_at          TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  revoked_by            UUID REFERENCES public.app_users(id),
  notes                 TEXT,
  created_by            UUID REFERENCES public.app_users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant   ON public.api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status   ON public.api_keys(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash     ON public.api_keys(key_hash);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Only the Super Admin can issue or manage API keys.
DROP POLICY IF EXISTS "super_admin_manage_api_keys" ON public.api_keys;
CREATE POLICY "super_admin_manage_api_keys"
  ON public.api_keys FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Other platform staff may READ key metadata (never hashes) for
-- audit/support views — the UI only renders non-secret columns.
DROP POLICY IF EXISTS "app_users_read_api_keys" ON public.api_keys;
CREATE POLICY "app_users_read_api_keys"
  ON public.api_keys FOR SELECT
  USING (public.is_active_app_user());

-- ─── Per-request usage log ───
-- Written by the public-api edge function via the service role
-- (bypasses RLS). Powers rate limiting and the usage dashboard.
CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  api_key_id   UUID REFERENCES public.api_keys(id) ON DELETE CASCADE,
  tenant_id    UUID,
  method       TEXT NOT NULL,
  path         TEXT NOT NULL,
  status_code  INTEGER NOT NULL,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_key_time
  ON public.api_request_logs(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_tenant_time
  ON public.api_request_logs(tenant_id, created_at DESC);

ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

-- Platform staff can inspect usage; writes come from service role only.
DROP POLICY IF EXISTS "app_users_read_api_request_logs" ON public.api_request_logs;
CREATE POLICY "app_users_read_api_request_logs"
  ON public.api_request_logs FOR SELECT
  USING (public.is_active_app_user());
