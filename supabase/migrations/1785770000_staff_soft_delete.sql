-- Same fix as branches_soft_delete.sql, for staff: deactivating a user
-- (is_active) is a reversible, user-facing "Active/Inactive" status a
-- manager can flip back at any time, and fetchStaff never excluded either
-- state, so there was no way to make someone actually disappear from the
-- roster when they left. Give delete its own column so it never collides
-- with that status toggle.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
