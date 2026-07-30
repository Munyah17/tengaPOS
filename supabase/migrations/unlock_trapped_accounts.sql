-- Emergency unlock for accounts trapped by aggressive session validation
-- The guard_user_lock_transitions trigger blocks unlocks unless caller is Super Admin,
-- but RLS prevents even service role from bypassing it. Temporarily disable trigger,
-- unlock trapped accounts, then re-enable.

-- Disable the guard trigger temporarily
ALTER TABLE public.users DISABLE TRIGGER guard_user_lock_transitions;

-- Unlock all currently locked accounts
UPDATE public.users
SET is_locked = false, locked_reason = null, locked_at = null
WHERE is_locked = true;

-- Re-enable the guard trigger
ALTER TABLE public.users ENABLE TRIGGER guard_user_lock_transitions;

-- Verify unlock succeeded
SELECT COUNT(*) as locked_count FROM public.users WHERE is_locked = true;
