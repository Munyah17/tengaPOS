-- Super Admin needs to fully delete tenants (real production launch means
-- some early signups were test accounts) as well as a softer "terminate"
-- that keeps a log entry (name, dates, reason) instead of vanishing
-- silently. A DELETE RLS policy for super_admin already existed
-- (super_admin_delete_tenants) and every tenant_id FK already cascades,
-- so a hard DELETE FROM tenants safely wipes all of that tenant's data.

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check CHECK (status IN ('pending', 'active', 'suspended', 'deleted'));

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS termination_reason TEXT;

-- The existing app_users_approve_tenants UPDATE policy allows any active
-- app_user (admin included) to change tenant status, for the normal
-- approve/suspend/reinstate flows. Terminating (soft-delete) must stay
-- Super Admin-only, so guard that specific transition with a trigger
-- rather than touching the broader policy.
CREATE OR REPLACE FUNCTION public.guard_tenant_status_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'deleted' AND OLD.status IS DISTINCT FROM 'deleted' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only Super Admin can delete a tenant';
  END IF;
  IF NEW.status = 'suspended' AND OLD.status IS DISTINCT FROM 'suspended' AND NEW.suspended_at IS NULL THEN
    NEW.suspended_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tenant_status_transitions ON public.tenants;
CREATE TRIGGER trg_guard_tenant_status_transitions
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_status_transitions();
