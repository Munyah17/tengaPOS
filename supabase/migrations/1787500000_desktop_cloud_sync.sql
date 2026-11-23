-- Cloud Hosting Fee: paid add-on that unlocks business-data cloud sync on
-- standalone desktop terminals (base $10/mo, scales with usage tiers later).
-- Settlement flips tenants.features.desktop_cloud_sync = true and stamps this
-- expiry; the desktop-license edge function surfaces it as
-- entitlements.features.cloud_sync in every issued/renewed lease.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS desktop_cloud_sync_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_desktop_cloud_sync_expires
  ON public.tenants(desktop_cloud_sync_expires_at);

-- signup_checkouts.plan_type must accept every add-on plan key
-- signup-checkout writes; the fiscal-era CHECK only knew fiscal_*, which
-- rejected (and silently dropped) erp_/ai_/wa_/hosting_/dcs_* rows.
ALTER TABLE public.signup_checkouts
  DROP CONSTRAINT IF EXISTS signup_checkouts_plan_type_check;
ALTER TABLE public.signup_checkouts
  ADD CONSTRAINT signup_checkouts_plan_type_check
  CHECK (
    plan_type IN (
      'byod_monthly', 'byod_yearly', 'combo_6month',
      'standard_plan', 'pro_package', 'business', 'enterprise'
    )
    OR plan_type ~ '^(fiscal|erp|ai|wa|hosting|dcs)_(monthly|quarterly|halfyear|yearly)$'
  );

-- byod_yearly is a real plan (signup-checkout prices it) but the tenants
-- plan check never learned it — settlement would mark the checkout paid
-- while the tenant update failed. Keep the two constraints in step.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_plan_type_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_plan_type_check
  CHECK (plan_type IN (
    'byod_monthly', 'byod_yearly',
    'standard_plan', 'pro_package', 'business', 'enterprise'
  ));
