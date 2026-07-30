-- Emergency unlock: guard_user_lock_transitions() checks is_super_admin(),
-- which reads auth.uid() — NULL outside of an authenticated request (SQL
-- Editor, migrations), so is_super_admin() is always false there and the
-- trigger blocks every unlock attempt, even run as postgres/service_role.
--
-- The trigger is named trg_guard_user_lock (not guard_user_lock_transitions,
-- that's the function it calls) — disable it by its actual name, unlock,
-- then re-enable.
ALTER TABLE public.users DISABLE TRIGGER trg_guard_user_lock;

UPDATE public.users
SET is_locked = false, locked_reason = null, locked_at = null
WHERE is_locked = true;

ALTER TABLE public.users ENABLE TRIGGER trg_guard_user_lock;

-- Verify
SELECT COUNT(*) as remaining_locked FROM public.users WHERE is_locked = true;
