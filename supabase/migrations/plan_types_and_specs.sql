-- ============================================================
-- Expanded plan types + per-tenant feature specs
-- ============================================================

-- 1. Drop the old 2-option plan_type constraint
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_plan_type_check;

-- 2. Add new constraint with all plan tiers
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_plan_type_check
  CHECK (plan_type IN ('byod_monthly', 'standard_plan', 'pro_package', 'business', 'enterprise'));

-- 3. Per-tenant customisable feature specs
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS features           JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS whitelabel         JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS backup_config      JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dedicated_technician_id UUID REFERENCES public.app_users(id);
