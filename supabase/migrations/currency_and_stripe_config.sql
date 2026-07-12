-- ============================================================
-- Multi-currency + tenant-level Stripe config. Idempotent.
-- ============================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS stripe_publishable_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT;
