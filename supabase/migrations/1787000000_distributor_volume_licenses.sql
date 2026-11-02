-- ============================================================
-- DISTRIBUTOR / VOLUME DESKTOP LICENSES
-- Run ONCE in Supabase Dashboard > SQL Editor. Idempotent.
--
-- Adds wholesale dealers: a distributor gets a custom per-seat
-- price; each volume license is a multi-use activation code with
-- a seat cap (max_uses) and a licence period (valid_until) that
-- caps issued leases. Terminals activated on the code are tagged
-- to the dealer for fleet monitoring.
-- ============================================================

-- ─── 1. Distributors ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.desktop_distributors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  contact_email  TEXT,
  contact_phone  TEXT,
  seat_price_usd NUMERIC(10,2) NOT NULL DEFAULT 150.00, -- custom per-device rate
  notes          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.desktop_distributors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_distributors" ON public.desktop_distributors;
CREATE POLICY "staff_read_distributors"
  ON public.desktop_distributors FOR SELECT
  USING (public.is_active_app_user());

DROP POLICY IF EXISTS "super_admin_write_distributors" ON public.desktop_distributors;
CREATE POLICY "super_admin_write_distributors"
  ON public.desktop_distributors FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── 2. Volume (multi-use) activation codes ──────────────────
-- max_uses already exists; uses counts redemptions, valid_until
-- caps the licence period (leases cannot exceed it).
ALTER TABLE public.desktop_activation_codes
  ADD COLUMN IF NOT EXISTS distributor_id UUID
    REFERENCES public.desktop_distributors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS uses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dac_distributor
  ON public.desktop_activation_codes(distributor_id) WHERE distributor_id IS NOT NULL;

-- ─── 3. Devices tagged to their dealer ───────────────────────
ALTER TABLE public.desktop_devices
  ADD COLUMN IF NOT EXISTS distributor_id UUID
    REFERENCES public.desktop_distributors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dd_distributor
  ON public.desktop_devices(distributor_id) WHERE distributor_id IS NOT NULL;

-- ─── 4. Multi-use-aware code consumption ─────────────────────
-- Replaces the single-use version: increments uses atomically;
-- the code flips to 'consumed' only when the seat cap is hit.
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
  SET uses = uses + 1,
      status = CASE WHEN uses + 1 >= max_uses THEN 'consumed' ELSE status END,
      consumed_at = CASE WHEN uses + 1 >= max_uses THEN NOW() ELSE consumed_at END,
      consumed_by_device_id = CASE WHEN uses + 1 >= max_uses THEN p_device_id ELSE consumed_by_device_id END
  WHERE id = (
    SELECT id FROM public.desktop_activation_codes
    WHERE code_hash = p_code_hash
      AND status = 'pending'
      AND uses < max_uses
      AND expires_at > NOW()
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING * INTO c;
  RETURN c;
END;
$$;
