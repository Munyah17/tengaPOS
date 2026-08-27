-- Job-title tag, not a new auth role -- pharmacist/pharmacy technician/
-- pharmacy assistant/dispatch reuse whatever login role (cashier/
-- shop_manager/etc.) already governs their permissions; this column is
-- display/reporting only. Generic (not pharmacy-specific in the DB) so any
-- tenant can use it later, same as how `technicians.specialty` isn't
-- scoped to one industry either.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS job_title TEXT;
