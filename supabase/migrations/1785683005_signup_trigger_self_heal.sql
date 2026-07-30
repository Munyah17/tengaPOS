-- Investigation finding: 11 of 12 currently-orphaned auth.users rows are
-- failed SIGNUPS (business_name/business_type in their metadata), not staff
-- adds. handle_new_user() had no exception handling — if the tenant/user/
-- branch insert sequence failed partway (a transient error, an unexpected
-- constraint), the auth.users row this trigger fires FROM ends up committed
-- with no matching public.users/tenants/branches ever created, and that
-- person's email is now permanently claimed in auth.users. Since Supabase
-- Auth enforces email uniqueness project-wide, they (or anyone else — the
-- system has no way to know it's the same person) can never sign up with
-- that email again — every attempt fails with "already registered" even
-- though, from their side, no account visibly exists anywhere.
--
-- Fix: catch any exception during tenant/user/branch creation inside the
-- trigger itself (Postgres gives a PL/pgSQL EXCEPTION block its own
-- sub-transaction/savepoint, so statements inside it commit even though the
-- statements that failed roll back). Log full details to signup_failures
-- for a person to review and manually finish provisioning, and still
-- RETURN NEW so the auth.users signup itself succeeds — the account exists
-- and its owner can sign in, rather than being silently destroyed.

CREATE TABLE IF NOT EXISTS public.signup_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL,
  email TEXT NOT NULL,
  error_message TEXT NOT NULL,
  raw_meta JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.signup_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_staff_read_signup_failures" ON public.signup_failures;
CREATE POLICY "platform_staff_read_signup_failures"
  ON public.signup_failures FOR SELECT
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.app_users WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  ));

DROP POLICY IF EXISTS "platform_staff_update_signup_failures" ON public.signup_failures;
CREATE POLICY "platform_staff_update_signup_failures"
  ON public.signup_failures FOR UPDATE
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.app_users WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  ));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
  business_name TEXT;
  user_name     TEXT;
  business_type TEXT;
  tenant_slug   TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.raw_user_meta_data->>'is_app_staff', 'false') = 'true'
     OR COALESCE(NEW.raw_user_meta_data->>'skip_tenant_setup', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  BEGIN
    business_name := COALESCE(NEW.raw_user_meta_data->>'business_name', 'My Business');
    user_name     := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
    business_type := COALESCE(NEW.raw_user_meta_data->>'business_type', 'retail');
    tenant_slug   := lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g'))
                     || '-' || substring(gen_random_uuid()::text, 1, 6);

    INSERT INTO public.tenants (name, slug, status, pos_mode, is_active)
    VALUES (
      business_name,
      tenant_slug,
      'pending',
      CASE WHEN business_type = 'restaurant' THEN 'restaurant' ELSE 'retail' END,
      true
    )
    RETURNING id INTO new_tenant_id;

    INSERT INTO public.users (id, tenant_id, name, email, role, is_active)
    VALUES (NEW.id, new_tenant_id, user_name, NEW.email, 'vendor', true);

    INSERT INTO public.branches (tenant_id, name, is_main, is_active)
    VALUES (new_tenant_id, 'Main Branch', true, true);
  EXCEPTION WHEN OTHERS THEN
    -- Don't destroy the signup — log it and let the auth account stand so
    -- its email isn't permanently burned. A person finishes provisioning
    -- (or the user is asked to contact support) instead of every retry
    -- failing forever with "already registered" for an account that, from
    -- their side, doesn't appear to exist anywhere.
    INSERT INTO public.signup_failures (auth_user_id, email, error_message, raw_meta)
    VALUES (NEW.id, NEW.email, SQLERRM, NEW.raw_user_meta_data);
  END;

  RETURN NEW;
END;
$$;
