-- Placeholder seam for a future health263.system integration -- no HTTP
-- calls, no sync logic. Just where a tenant's facility ID would live once
-- that integration is actually built. (prescriptions.synced_to_health263,
-- the matching inert flag, was already added alongside the prescriptions
-- table in 1786210000_prescriptions_filing.sql.)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS health263_facility_id TEXT;
