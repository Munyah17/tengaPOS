-- Explicit incident: a super_admin app_users row got deleted this session
-- as part of resolving a (mis-diagnosed) "duplicate account" cleanup,
-- locking the real Super Admin out of the platform. A memory/instruction
-- not to repeat that relies on nobody making the same judgment call wrong
-- again -- a real guardrail doesn't. This blocks the two ways a
-- super_admin row could be lost or hijacked, at the database level, so no
-- future action (mine or anyone else's) can do it by mistake.
CREATE OR REPLACE FUNCTION public.protect_super_admin_accounts()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'super_admin' THEN
      RAISE EXCEPTION 'Super Admin accounts cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: block changing a super_admin's email, and block demoting a
  -- super_admin away from the role (both are effectively "losing" the
  -- account from this portal's point of view).
  IF OLD.role = 'super_admin' THEN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'A Super Admin account''s email cannot be changed.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'A Super Admin account cannot be demoted.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_super_admin_accounts_trigger ON public.app_users;
CREATE TRIGGER protect_super_admin_accounts_trigger
  BEFORE UPDATE OR DELETE ON public.app_users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_super_admin_accounts();
