-- Register.jsx already blocks submission client-side when phone is blank,
-- but handle_new_user() never actually persisted it -- the INSERT INTO
-- public.users never listed the phone column, so it was silently dropped
-- even on signups where the visitor did fill it in (confirmed live: 21 of
-- 29 vendor accounts have no phone on file). Two fixes: actually save it,
-- and reject a genuine tenant signup missing it outright (defense in depth
-- against any path that bypasses the frontend form) rather than let the
-- BEGIN/EXCEPTION block below swallow it into signup_failures, which would
-- leave the person with a bare auth account and no tenant to show for it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
  business_name TEXT;
  user_name     TEXT;
  business_type TEXT;
  tenant_slug   TEXT;
  user_phone    TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.raw_user_meta_data->>'is_app_staff', 'false') = 'true'
     OR COALESCE(NEW.raw_user_meta_data->>'skip_tenant_setup', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  user_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
  IF user_phone IS NULL THEN
    RAISE EXCEPTION 'Phone number is required to sign up.';
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

    INSERT INTO public.users (id, tenant_id, name, email, phone, role, is_active)
    VALUES (NEW.id, new_tenant_id, user_name, NEW.email, user_phone, 'vendor', true);

    INSERT INTO public.branches (tenant_id, name, is_main, is_active)
    VALUES (new_tenant_id, 'Main Branch', true, true);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.signup_failures (auth_user_id, email, error_message, raw_meta)
    VALUES (NEW.id, NEW.email, SQLERRM, NEW.raw_user_meta_data);
  END;

  RETURN NEW;
END;
$$;
