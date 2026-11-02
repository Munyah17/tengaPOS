-- ============================================================
-- DESKTOP APP MANAGEMENT — Super Admin fleet + security layer
-- Run this ONCE in Supabase Dashboard > SQL Editor.
-- Idempotent: safe to re-run. Requires 1786700000_desktop_licensing.
--
-- Implements contract §2.9 (docs/desktop-license-api-v1.md):
--   - device telemetry: last IP, user-agent, security flags
--   - device lifecycle: suspend + delete states
--   - security event log (failed activations, forged signatures,
--     cloned installs, unauthorized builds, denied update probes)
--   - installer download log
--   - infringement case files with usage-billing estimate
-- ============================================================

-- ─── 1. Device telemetry + lifecycle ──────────────────────────

ALTER TABLE public.desktop_devices
  ADD COLUMN IF NOT EXISTS last_ip  TEXT,
  ADD COLUMN IF NOT EXISTS last_ua  TEXT,
  ADD COLUMN IF NOT EXISTS flags    JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

-- Widen the status CHECK to include suspend/delete states.
ALTER TABLE public.desktop_devices
  DROP CONSTRAINT IF EXISTS desktop_devices_status_check;
ALTER TABLE public.desktop_devices
  ADD CONSTRAINT desktop_devices_status_check
  CHECK (status IN ('active', 'suspended', 'revoked', 'deleted'));

CREATE INDEX IF NOT EXISTS idx_dd_flags ON public.desktop_devices USING GIN (flags);

ALTER TABLE public.desktop_checkins
  ADD COLUMN IF NOT EXISTS ip TEXT;

-- ─── 2. Security event log ────────────────────────────────────
-- Every suspicious touchpoint writes here; device.flags gets the
-- summary. Auto-revocation is OFF by design (false-positive risk) —
-- events queue devices for human review.

CREATE TABLE IF NOT EXISTS public.desktop_license_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN (
    'activation_failed', 'signature_fail', 'device_cloned',
    'unauthorized_build', 'update_probe_denied',
    'device_revoked', 'device_suspended', 'device_reinstated',
    'device_deleted', 'license_issued', 'manual_report'
  )),
  device_id   UUID REFERENCES public.desktop_devices(id) ON DELETE SET NULL,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dle_type   ON public.desktop_license_events(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dle_device ON public.desktop_license_events(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dle_tenant ON public.desktop_license_events(tenant_id, created_at DESC);

ALTER TABLE public.desktop_license_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_license_events" ON public.desktop_license_events;
CREATE POLICY "staff_read_license_events"
  ON public.desktop_license_events FOR SELECT
  USING (public.is_active_app_user());

-- ─── 3. Installer download log ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desktop_downloads (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  release_id  UUID REFERENCES public.desktop_releases(id) ON DELETE SET NULL,
  version     TEXT,
  os          TEXT NOT NULL,
  channel     TEXT NOT NULL,
  ip          TEXT,
  ua          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ddls_release ON public.desktop_downloads(release_id, created_at DESC);

ALTER TABLE public.desktop_downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_downloads" ON public.desktop_downloads;
CREATE POLICY "staff_read_downloads"
  ON public.desktop_downloads FOR SELECT
  USING (public.is_active_app_user());

-- ─── 4. Infringement cases (cracked/pirated installs) ─────────

CREATE TABLE IF NOT EXISTS public.desktop_infringement_cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('server_detected', 'manual')),
  status            TEXT NOT NULL DEFAULT 'detected'
                      CHECK (status IN ('detected', 'notice_sent', 'settled', 'escalated', 'closed')),
  -- Subject — whatever we could tie the crack to
  device_id         UUID REFERENCES public.desktop_devices(id) ON DELETE SET NULL,
  tenant_id         UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  ip                TEXT,
  fingerprint       TEXT,
  description       TEXT NOT NULL DEFAULT '',
  evidence          JSONB NOT NULL DEFAULT '{}',        -- urls, screenshots refs, event ids
  -- Usage billing estimate: what they should have paid
  plan_rate         NUMERIC(10,2),                       -- monthly rate in USD
  months_observed   NUMERIC(6,2),                        -- how long the crack ran
  seats             INTEGER NOT NULL DEFAULT 1,
  estimated_damages NUMERIC(12,2) GENERATED ALWAYS AS
                      (COALESCE(plan_rate, 0) * COALESCE(months_observed, 0) * seats) STORED,
  -- Demand-letter trail
  notice_sent_at    TIMESTAMPTZ,
  notice_recipient  TEXT,
  notice_channel    TEXT,                                -- email | whatsapp | courier | lawyer
  notes             TEXT,
  created_by        UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.desktop_infringement_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_manage_infringements" ON public.desktop_infringement_cases;
CREATE POLICY "super_admin_manage_infringements"
  ON public.desktop_infringement_cases FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── 5. Usage reports (License Manager queue, contract §2.3b/§5b) ───
-- Append-only telemetry flushed from each device's local report queue.
-- report_id is the dedupe key — a retried flush re-submits unacked IDs.

CREATE TABLE IF NOT EXISTS public.desktop_usage_reports (
  report_id   UUID PRIMARY KEY,                     -- client-generated, dedupe key
  device_id   UUID NOT NULL REFERENCES public.desktop_devices(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('sale', 'inventory', 'session', 'error', 'lease_check')),
  occurred_at TIMESTAMPTZ NOT NULL,                 -- when the event happened on the device
  data        JSONB NOT NULL DEFAULT '{}',          -- aggregates only — no credentials/line items
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip          TEXT
);

-- Rolling session-token chain (contract §2.3): each check-in rotates the
-- token; the client presents its stored token next time. Accept current OR
-- previous (one lost-response window); anything else = cloned license file.
ALTER TABLE public.desktop_devices
  ADD COLUMN IF NOT EXISTS session_token      TEXT,
  ADD COLUMN IF NOT EXISTS prev_session_token TEXT;

CREATE INDEX IF NOT EXISTS idx_dur_device ON public.desktop_usage_reports(device_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_dur_tenant ON public.desktop_usage_reports(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_dur_kind   ON public.desktop_usage_reports(kind, occurred_at DESC);

ALTER TABLE public.desktop_usage_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_usage_reports" ON public.desktop_usage_reports;
CREATE POLICY "staff_read_usage_reports"
  ON public.desktop_usage_reports FOR SELECT
  USING (public.is_active_app_user());

-- ─── 6. License purchases (contract §2.2b) ────────────────────
-- Once-off $150 desktop licenses: self-purchased (pending → paid) or
-- staff-issued (paid, amount 0). One purchase = one code = one seat.

CREATE TABLE IF NOT EXISTS public.desktop_license_purchases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code_id     UUID REFERENCES public.desktop_activation_codes(id) ON DELETE SET NULL,
  amount      NUMERIC(10,2) NOT NULL DEFAULT 150,
  currency    TEXT NOT NULL DEFAULT 'USD',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded')),
  source      TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('self', 'staff')),
  payment_ref TEXT,
  created_by  UUID,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlp_tenant ON public.desktop_license_purchases(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_dlp_status ON public.desktop_license_purchases(status, created_at DESC);

ALTER TABLE public.desktop_license_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_own_purchases" ON public.desktop_license_purchases;
CREATE POLICY "tenant_read_own_purchases"
  ON public.desktop_license_purchases FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "super_admin_manage_purchases" ON public.desktop_license_purchases;
CREATE POLICY "super_admin_manage_purchases"
  ON public.desktop_license_purchases FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- When a Paynow payment_session linked to a desktop purchase (purchase
-- .payment_ref = session.reference) settles paid, flip the purchase too —
-- covers the Paynow callback, poll-status endpoint AND manual approval
-- (db.js approvePaymentSession) in a single hook.
CREATE OR REPLACE FUNCTION public.settle_desktop_purchase()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    UPDATE public.desktop_license_purchases
    SET status = 'paid', paid_at = NOW()
    WHERE payment_ref = NEW.reference
      AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settle_desktop_purchase ON public.payment_sessions;
CREATE TRIGGER trg_settle_desktop_purchase
  AFTER UPDATE OF status ON public.payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.settle_desktop_purchase();

-- ─── 7. Event helper ──────────────────────────────────────────
-- One-call logging + device flagging, used by the edge function.
CREATE OR REPLACE FUNCTION public.flag_device(p_device_id UUID, p_flag TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.desktop_devices
  SET flags = flags || jsonb_build_object(p_flag, true),
      updated_at = NOW()
  WHERE id = p_device_id;
$$;
