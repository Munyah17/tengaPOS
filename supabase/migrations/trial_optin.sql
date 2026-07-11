-- ============================================================
-- TRIAL BECOMES OPT-IN + user management policies
-- Idempotent: safe to re-run.
--
--  - Signup no longer auto-starts the trial. New tenants are
--    'pending' and land on /checkout, where the 7-day free
--    trial is one of the pricing options ("Due today — $0!").
--  - start_free_trial(): tenant owner starts their own trial,
--    once. Server-side checks; client cannot forge it.
--  - Platform staff can UPDATE tenant users (suspend/edit) —
--    deletes go through the manage-user edge function.
-- ============================================================

-- ─── 1. Signup trigger: pending until trial or payment ───

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

  -- Platform staff created by Super Admin: never create a tenant
  IF COALESCE(NEW.raw_user_meta_data->>'is_app_staff', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

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

  RETURN NEW;
END;
$$;

-- ─── 2. Opt-in trial: one per tenant, started by the owner ───

CREATE OR REPLACE FUNCTION public.start_free_trial()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_id  UUID;
  t     RECORD;
  ends  TIMESTAMPTZ;
BEGIN
  SELECT tenant_id INTO t_id FROM public.users WHERE id = auth.uid();
  IF t_id IS NULL THEN
    RAISE EXCEPTION 'No business found for this account';
  END IF;

  SELECT * INTO t FROM public.tenants WHERE id = t_id;
  IF t.plan_start_date IS NOT NULL THEN
    RAISE EXCEPTION 'This business already has an active plan';
  END IF;
  IF t.trial_ends_at IS NOT NULL THEN
    RAISE EXCEPTION 'The free trial has already been used for this business';
  END IF;

  ends := NOW() + INTERVAL '7 days';
  UPDATE public.tenants
  SET status = 'active', trial_ends_at = ends, updated_at = NOW()
  WHERE id = t_id;

  RETURN json_build_object('ok', true, 'trial_ends_at', ends);
END;
$$;

-- ─── 3. Platform staff manage tenant users (suspend / edit) ───

DROP POLICY IF EXISTS "app_users_update_users" ON public.users;
CREATE POLICY "app_users_update_users"
  ON public.users FOR UPDATE
  USING (public.is_active_app_user())
  WITH CHECK (public.is_active_app_user());
