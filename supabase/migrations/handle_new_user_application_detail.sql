-- Extends the signup trigger to capture the full application detail Super
-- Admin needs to review a pending tenant (industry, location, planned
-- branches, team size, plan preference, work address/contact, special
-- requirements) — previously only business name/type/phone were captured.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.tenants (
    name, slug, status, pos_mode, is_active,
    industry, location, requested_branches, team_size_range, requested_plan_pref,
    work_address, work_contact, special_requirements
  )
  VALUES (
    business_name,
    tenant_slug,
    'pending',
    CASE WHEN business_type = 'restaurant' THEN 'restaurant' ELSE 'retail' END,
    true,
    NEW.raw_user_meta_data->>'industry',
    NEW.raw_user_meta_data->>'location',
    NULLIF(NEW.raw_user_meta_data->>'requested_branches', '')::INTEGER,
    NEW.raw_user_meta_data->>'team_size_range',
    NEW.raw_user_meta_data->>'requested_plan_pref',
    NEW.raw_user_meta_data->>'work_address',
    NEW.raw_user_meta_data->>'work_contact',
    NEW.raw_user_meta_data->>'special_requirements'
  )
  RETURNING id INTO new_tenant_id;

  INSERT INTO public.users (id, tenant_id, name, email, phone, role, is_active)
  VALUES (NEW.id, new_tenant_id, user_name, NEW.email, user_phone, 'vendor', true);

  INSERT INTO public.branches (tenant_id, name, is_main, is_active)
  VALUES (new_tenant_id, 'Main Branch', true, true);

  RETURN NEW;
END;
$function$
