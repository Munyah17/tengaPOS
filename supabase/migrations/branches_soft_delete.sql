-- Branch delete used to reuse the is_active column, which is also the
-- user-facing "Active/Inactive" status field editable from the branch edit
-- form — a deleted branch and a merely-deactivated branch were
-- indistinguishable, and fetchBranches never excluded either, so a
-- "deleted" branch reappeared in the list on next load. Give delete its own
-- column so it never collides with that status toggle again.
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
