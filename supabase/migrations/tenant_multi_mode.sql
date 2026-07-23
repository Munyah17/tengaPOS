-- Multi-mode tenant assignment. Every tenant still has one *default* mode
-- (pos_mode, set at signup, unchanged in meaning) but Super Admin can now
-- enable additional modes on top of it (enabled_modes) -- e.g. a workshop
-- client who's also asked for retail-style counter sales. By default a
-- tenant only ever has its one signup mode enabled; nothing changes for
-- existing tenants until Super Admin explicitly adds a second one.
--
-- Third mode: 'workshop' (Workshop Mode) -- behaves exactly like Restaurant
-- Mode architecturally (same gating pattern, reuses Core POS/Inventory/
-- Reports/Staff/Branches/Transactions/Settings, adds its own nav items and
-- dashboard content on top). Covers garage & tyre-fitment style businesses.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS enabled_modes TEXT[] NOT NULL DEFAULT ARRAY['retail'];

-- Backfill: every existing tenant's enabled set is exactly its current
-- default mode (added column above defaulted everyone to 'retail', which
-- is wrong for existing restaurant tenants -- fix that here).
UPDATE public.tenants SET enabled_modes = ARRAY[pos_mode];

-- Add 'garage' as a third recognized business type at every signup path
-- that creates a tenant. Only public.handle_new_user() is actually live
-- (confirmed against the running trigger) -- the other historical
-- versions of this function in earlier migration files are superseded
-- and not re-applied.
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
  resolved_mode TEXT;
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
  resolved_mode := CASE
    WHEN business_type = 'restaurant' THEN 'restaurant'
    WHEN business_type = 'workshop' THEN 'workshop'
    ELSE 'retail'
  END;
  tenant_slug   := lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g'))
                   || '-' || substring(gen_random_uuid()::text, 1, 6);

  INSERT INTO public.tenants (
    name, slug, status, pos_mode, enabled_modes, is_active,
    industry, location, requested_branches, team_size_range, requested_plan_pref,
    work_address, work_contact, special_requirements
  )
  VALUES (
    business_name,
    tenant_slug,
    'pending',
    resolved_mode,
    ARRAY[resolved_mode],
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
$function$;
