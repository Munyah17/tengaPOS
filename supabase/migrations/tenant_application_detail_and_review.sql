-- Super Admin couldn't see what a tenant actually typed at signup (only
-- business name/slug), and had no clean Reject/Stall outcome for a pending
-- application — only Approve, or destructive Terminate/Delete meant for
-- already-active tenants. This adds the missing signup-detail columns and a
-- proper rejected/stalled status.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS requested_branches INTEGER,
  ADD COLUMN IF NOT EXISTS team_size_range TEXT,
  ADD COLUMN IF NOT EXISTS requested_plan_pref TEXT,
  ADD COLUMN IF NOT EXISTS work_address TEXT,
  ADD COLUMN IF NOT EXISTS work_contact TEXT,
  ADD COLUMN IF NOT EXISTS special_requirements TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS stalled_reason TEXT,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'suspended'::text, 'deleted'::text, 'rejected'::text, 'stalled'::text]));
