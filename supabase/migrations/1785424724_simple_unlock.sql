-- Unlock all trapped accounts by directly updating the column
-- The migration runs as superuser so triggers/RLS don't apply
UPDATE public.users
SET is_locked = false, locked_reason = null, locked_at = null
WHERE is_locked = true;

-- Verify unlock succeeded
SELECT COUNT(*) as remaining_locked FROM public.users WHERE is_locked = true;
