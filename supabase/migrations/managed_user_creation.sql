-- ============================================================
-- Allow platform staff to create tenant users via manage-user
-- edge function without the signup trigger creating a new
-- tenant for them. Idempotent.
-- ============================================================

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

  -- Accounts created programmatically (platform staff, or tenant users
  -- added by Super Admin / Admin) manage their own rows — skip tenant setup
  IF COALESCE(NEW.raw_user_meta_data->>'is_app_staff', 'false') = 'true'
     OR COALESCE(NEW.raw_user_meta_data->>'skip_tenant_setup', 'false') = 'true' THEN
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
