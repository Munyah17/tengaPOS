-- ============================================================
-- 7-DAY FREE TRIAL
-- Idempotent: safe to re-run.
--
--  - New signups get instant FULL access (vendor dashboard)
--    with trial_ends_at = now() + 7 days. No pending screen.
--  - expire_trials() suspends tenants whose trial lapsed
--    without a paid plan (plan_start_date stays NULL until a
--    payment webhook or Super Admin approval sets it).
--  - pg_cron runs the expiry hourly, so lockout is enforced in
--    the database — not just in the browser.
-- ============================================================

-- ─── 1. Signup trigger: start trial immediately ───

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

  -- Platform staff created by Super Admin (create-staff function):
  -- never create a tenant for them
  IF COALESCE(NEW.raw_user_meta_data->>'is_app_staff', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  business_name := COALESCE(NEW.raw_user_meta_data->>'business_name', 'My Business');
  user_name     := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  business_type := COALESCE(NEW.raw_user_meta_data->>'business_type', 'retail');
  tenant_slug   := lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g'))
                   || '-' || substring(gen_random_uuid()::text, 1, 6);

  -- 7-day free trial: active immediately, expires automatically
  INSERT INTO public.tenants (name, slug, status, pos_mode, is_active, trial_ends_at)
  VALUES (
    business_name,
    tenant_slug,
    'active',
    CASE WHEN business_type = 'restaurant' THEN 'restaurant' ELSE 'retail' END,
    true,
    NOW() + INTERVAL '7 days'
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.users (id, tenant_id, name, email, role, is_active)
  VALUES (NEW.id, new_tenant_id, user_name, NEW.email, 'vendor', true);

  INSERT INTO public.branches (tenant_id, name, is_main, is_active)
  VALUES (new_tenant_id, 'Main Branch', true, true);

  RETURN NEW;
END;
$$;

-- ─── 2. Trial expiry enforcement ───

CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tenants
  SET status = 'suspended', updated_at = NOW()
  WHERE status = 'active'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < NOW()
    AND plan_start_date IS NULL;   -- a paid/approved plan clears the trial lock
END;
$$;

-- ─── 3. Run hourly via pg_cron ───

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-trials') THEN
    PERFORM cron.unschedule('expire-trials');
  END IF;
  PERFORM cron.schedule('expire-trials', '15 * * * *', 'SELECT public.expire_trials()');
END;
$$;
