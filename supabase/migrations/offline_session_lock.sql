-- Offline-first auth: a cashier can keep working on a cached session while
-- offline (already implemented client-side). This adds the other half —
-- background revalidation against the server, and an account-lock that only
-- Super Admin can clear if that revalidation ever finds a genuine mismatch
-- (account deactivated/removed elsewhere while this device was offline).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_locked     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_reason TEXT,
  ADD COLUMN IF NOT EXISTS locked_at     TIMESTAMPTZ;

-- Locking (false -> true) is safe to allow broadly — a user can only ever
-- restrict their own access, never escalate it. Unlocking (true -> false)
-- must be Super Admin only, regardless of which RLS policy let an UPDATE
-- through (users_own_profile lets a user update their own row, and
-- app_users_update_users lets any platform admin update any user row) —
-- this trigger is the actual enforcement point.
CREATE OR REPLACE FUNCTION public.guard_user_lock_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.is_locked = true AND NEW.is_locked = false AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only Super Admin can unlock an account';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_lock ON public.users;
CREATE TRIGGER trg_guard_user_lock
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_lock_transitions();

-- A signed-in user can lock their own account (used when background
-- revalidation detects a genuine mismatch) — never anyone else's.
CREATE OR REPLACE FUNCTION public.lock_my_account(p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET is_locked = true, locked_reason = p_reason, locked_at = NOW()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_my_account(TEXT) TO authenticated;
