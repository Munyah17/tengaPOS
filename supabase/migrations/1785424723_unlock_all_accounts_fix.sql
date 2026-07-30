-- Emergency unlock for accounts trapped by aggressive session validation
-- Modify the guard_user_lock_transitions function to allow service_role to bypass it

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS guard_user_lock_transitions ON public.users;
DROP FUNCTION IF EXISTS public.guard_user_lock_transitions();

-- Recreate the function to allow service_role and admin bypass
CREATE FUNCTION public.guard_user_lock_transitions()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow service_role and bypasses
  IF current_setting('role') = 'authenticated' AND OLD.is_locked = true AND NEW.is_locked = false THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Only Super Admin can unlock an account';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Recreate the trigger
CREATE TRIGGER guard_user_lock_transitions
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_user_lock_transitions();

-- Now unlock all trapped accounts
UPDATE public.users
SET is_locked = false, locked_reason = null, locked_at = null
WHERE is_locked = true;

-- Verify
SELECT COUNT(*) as remaining_locked FROM public.users WHERE is_locked = true;
