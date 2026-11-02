-- ============================================================
-- DESKTOP LICENSING + UPDATE DELIVERY
-- Run this ONCE in Supabase Dashboard > SQL Editor.
-- Idempotent: safe to re-run.
--
-- Implements the server half of docs/desktop-license-api-v1.md:
--   - one-time activation codes (hashed, short-lived)
--   - devices bound to a desktop-generated public key
--   - signed lease audit trail (private key lives in Vault, not here)
--   - check-in dedupe + audit
--   - release channels/manifests/artifacts for the installer
--
-- All writes happen inside the desktop-license edge function using
-- the service role AFTER it has verified the caller (tenant JWT for
-- code/device management, device signature for check-ins, super_admin
-- for releases). RLS therefore only needs to expose reads:
--   - tenant members read their own codes/devices
--   - platform staff read everything
-- ============================================================

-- ─── 1. Activation codes ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desktop_activation_codes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code_hash             TEXT NOT NULL UNIQUE,          -- sha256 hex of the raw code
  code_hint             TEXT NOT NULL,                 -- last 4 chars for admin display
  label                 TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'consumed', 'expired', 'revoked')),
  max_uses              INTEGER NOT NULL DEFAULT 1,    -- contract: single-use
  expires_at            TIMESTAMPTZ NOT NULL,
  created_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at           TIMESTAMPTZ,
  consumed_by_device_id UUID,
  revoked_at            TIMESTAMPTZ,
  revoked_by            UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_dac_tenant  ON public.desktop_activation_codes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dac_status  ON public.desktop_activation_codes(status) WHERE status = 'pending';

ALTER TABLE public.desktop_activation_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_own_activation_codes" ON public.desktop_activation_codes;
CREATE POLICY "tenant_read_own_activation_codes"
  ON public.desktop_activation_codes FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "staff_read_activation_codes" ON public.desktop_activation_codes;
CREATE POLICY "staff_read_activation_codes"
  ON public.desktop_activation_codes FOR SELECT
  USING (public.is_active_app_user());

-- ─── 2. Devices ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desktop_devices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL DEFAULT 'Desktop Terminal',
  public_key            TEXT NOT NULL,                 -- base64 Ed25519 public key
  public_key_fingerprint TEXT NOT NULL,                -- sha256 prefix of pubkey
  device_fingerprint    TEXT,                          -- install-id hash from desktop
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'revoked')),
  app_version           TEXT,
  os                    TEXT,
  activation_code_id    UUID REFERENCES public.desktop_activation_codes(id) ON DELETE SET NULL,
  activated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checkin_at       TIMESTAMPTZ,
  lease_expires_at      TIMESTAMPTZ,
  grace_until           TIMESTAMPTZ,
  revoked_at            TIMESTAMPTZ,
  revoked_by            UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoke_reason         TEXT,
  deactivated_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dd_tenant  ON public.desktop_devices(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dd_pubkey ON public.desktop_devices(public_key) WHERE status = 'active';

ALTER TABLE public.desktop_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_own_devices" ON public.desktop_devices;
CREATE POLICY "tenant_read_own_devices"
  ON public.desktop_devices FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "staff_read_devices" ON public.desktop_devices;
CREATE POLICY "staff_read_devices"
  ON public.desktop_devices FOR SELECT
  USING (public.is_active_app_user());

-- ─── 3. Lease audit trail ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desktop_leases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID NOT NULL REFERENCES public.desktop_devices(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL,                          -- full signed lease incl. signature
  key_id      TEXT NOT NULL DEFAULT 'v1',
  issued_at   TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  grace_until TIMESTAMPTZ NOT NULL,
  reason      TEXT NOT NULL DEFAULT 'activation'       -- activation | renewal | reissue
                          CHECK (reason IN ('activation', 'renewal', 'reissue'))
);

CREATE INDEX IF NOT EXISTS idx_dl_device ON public.desktop_leases(device_id, issued_at DESC);

ALTER TABLE public.desktop_leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_own_leases" ON public.desktop_leases;
CREATE POLICY "tenant_read_own_leases"
  ON public.desktop_leases FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "staff_read_leases" ON public.desktop_leases;
CREATE POLICY "staff_read_leases"
  ON public.desktop_leases FOR SELECT
  USING (public.is_active_app_user());

-- ─── 4. Check-ins (dedupe + audit) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.desktop_checkins (
  checkin_id  UUID PRIMARY KEY,                        -- client-generated, dedupe key
  device_id   UUID NOT NULL REFERENCES public.desktop_devices(id) ON DELETE CASCADE,
  app_version TEXT,
  os          TEXT,
  offline_since TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dc_device ON public.desktop_checkins(device_id, created_at DESC);

ALTER TABLE public.desktop_checkins ENABLE ROW LEVEL SECURITY;
-- No client-readable policies: audit only, written via service role.

DROP POLICY IF EXISTS "staff_read_checkins" ON public.desktop_checkins;
CREATE POLICY "staff_read_checkins"
  ON public.desktop_checkins FOR SELECT
  USING (public.is_active_app_user());

-- ─── 5. Releases + artifacts ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desktop_releases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version               TEXT NOT NULL,                 -- semver, e.g. '1.5.0'
  channel               TEXT NOT NULL DEFAULT 'stable'
                          CHECK (channel IN ('stable', 'beta')),
  min_supported_version TEXT NOT NULL DEFAULT '0.0.0',
  rollout_pct           INTEGER NOT NULL DEFAULT 100
                          CHECK (rollout_pct BETWEEN 0 AND 100),
  release_notes_url     TEXT,
  manifest_signature    TEXT NOT NULL,                 -- ed25519 over canonical manifest
  published_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at          TIMESTAMPTZ,
  created_by            UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version, channel)
);

ALTER TABLE public.desktop_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_releases" ON public.desktop_releases;
CREATE POLICY "staff_read_releases"
  ON public.desktop_releases FOR SELECT
  USING (public.is_active_app_user());

DROP POLICY IF EXISTS "super_admin_write_releases" ON public.desktop_releases;
CREATE POLICY "super_admin_write_releases"
  ON public.desktop_releases FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.desktop_release_artifacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id  UUID NOT NULL REFERENCES public.desktop_releases(id) ON DELETE CASCADE,
  os          TEXT NOT NULL,                           -- 'win32-x64', 'darwin-arm64', ...
  storage_path TEXT NOT NULL,                          -- path in desktop-releases bucket
  sha256      TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL,
  signature   TEXT NOT NULL,                           -- ed25519 over sha256 digest bytes
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (release_id, os)
);

ALTER TABLE public.desktop_release_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_artifacts" ON public.desktop_release_artifacts;
CREATE POLICY "staff_read_artifacts"
  ON public.desktop_release_artifacts FOR SELECT
  USING (public.is_active_app_user());

DROP POLICY IF EXISTS "super_admin_write_artifacts" ON public.desktop_release_artifacts;
CREATE POLICY "super_admin_write_artifacts"
  ON public.desktop_release_artifacts FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── 6. Installer storage bucket (private; /v1/download mints
--        short-lived signed URLs so the binary itself is public-by-
--        link but never enumerable) ────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('desktop-releases', 'desktop-releases', false)
ON CONFLICT (id) DO NOTHING;

-- Super Admin uploads/installers; no tenant or public read — downloads
-- are served via short-lived signed URLs minted by desktop-license.
DROP POLICY IF EXISTS "super_admin_upload_desktop_releases" ON storage.objects;
CREATE POLICY "super_admin_upload_desktop_releases"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'desktop-releases' AND public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_update_desktop_releases" ON storage.objects;
CREATE POLICY "super_admin_update_desktop_releases"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'desktop-releases' AND public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_delete_desktop_releases" ON storage.objects;
CREATE POLICY "super_admin_delete_desktop_releases"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'desktop-releases' AND public.is_super_admin());

-- ─── 7. Atomic code consumption helper ────────────────────────
-- Called by the edge function inside the activation transaction.
-- Flips pending→consumed exactly once; returns the row or NULL.
CREATE OR REPLACE FUNCTION public.consume_activation_code(p_code_hash TEXT, p_device_id UUID)
RETURNS public.desktop_activation_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.desktop_activation_codes;
BEGIN
  UPDATE public.desktop_activation_codes
  SET status = 'consumed',
      consumed_at = NOW(),
      consumed_by_device_id = p_device_id
  WHERE id = (
    SELECT id FROM public.desktop_activation_codes
    WHERE code_hash = p_code_hash
      AND status = 'pending'
      AND expires_at > NOW()
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO c;
  RETURN c;
END;
$$;
