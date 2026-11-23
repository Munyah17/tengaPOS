-- Cloud Hosting Fee: paid add-on that unlocks business-data cloud sync on
-- standalone desktop terminals (base $10/mo, scales with usage tiers later).
-- Settlement flips tenants.features.desktop_cloud_sync = true and stamps this
-- expiry; the desktop-license edge function surfaces it as
-- entitlements.features.cloud_sync in every issued/renewed lease.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS desktop_cloud_sync_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenants_desktop_cloud_sync_expires
  ON public.tenants(desktop_cloud_sync_expires_at);
