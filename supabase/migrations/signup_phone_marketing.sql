-- Mandatory phone number at signup, for callbacks and a marketing contact
-- list. Stored on the vendor's own user row (that's who you'd actually
-- call). Platform staff (admin/super_admin) can already SELECT every user
-- via the existing app_users_select_users RLS policy, so no new policy is
-- needed to read it — this migration just adds the column and threads it
-- through the signup trigger.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

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
  user_phone    TEXT;
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
  user_phone    := NEW.raw_user_meta_data->>'phone';
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

  RETURN NEW;
END;
$$;
