-- ============================================================
-- FIX: every signup failing with "WhatsApp number is required"
-- Run this ONCE in Supabase Dashboard > SQL Editor.
-- Idempotent: safe to re-run.
--
-- Verified live (auth signup probe):
--   + metadata WITH whatsapp_number  -> signup + tenant + user +
--     branch all provisioned fine.
--   + metadata WITHOUT whatsapp_number -> signup rejected outright:
--     P0001 'WhatsApp number is required to sign up.'
--
-- The currently-live handle_new_user() (from
-- 1786060000_whatsapp_receipts_addon.sql) RAISES on missing
-- whatsapp_number OUTSIDE its exception block, so any client whose
-- signup metadata doesn't carry that field — stale cached PWA builds
-- from before the field existed, API-driven signups, anything other
-- than today's Register.jsx — is refused wholesale. A rejected signup
-- is a lost customer; a missing WhatsApp number is recoverable data.
-- WhatsApp therefore defaults to the signup phone (the Register form
-- itself defaults "Same as phone"), and missing phone no longer
-- hard-kills the signup either — it's logged to signup_failures for
-- follow-up instead, matching the self-heal intent of
-- 1785683005_signup_trigger_self_heal.sql.
--
-- This is also a CONSOLIDATED version: the live trigger had silently
-- dropped work from later migrations —
--   * application-detail columns (industry, location,
--     requested_branches, team_size_range, requested_plan_pref,
--     work_address, work_contact, special_requirements) from
--     handle_new_user_application_detail.sql / tenant_multi_mode.sql
--     — every signup since whatsapp_receipts went live has been
--     losing that data;
--   * 'workshop' as a resolved pos_mode + enabled_modes backfill from
--     tenant_multi_mode.sql — restaurant/workshop signups were being
--     defaulted to enabled_modes='{retail}'.
-- Both are restored here.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
  business_name TEXT;
  user_name     TEXT;
  user_phone    TEXT;
  user_whatsapp TEXT;
  business_type TEXT;
  resolved_mode TEXT;
  tenant_slug   TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_users WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Platform staff / admin-provisioned accounts: never create a tenant
  IF COALESCE(NEW.raw_user_meta_data->>'is_app_staff', 'false') = 'true'
     OR COALESCE(NEW.raw_user_meta_data->>'skip_tenant_setup', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  BEGIN
    business_name := COALESCE(NEW.raw_user_meta_data->>'business_name', 'My Business');
    user_name     := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
    user_phone    := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
    -- WhatsApp defaults to the phone line — the Register form's own
    -- "same as phone" behaviour — rather than refusing the signup.
    user_whatsapp := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'whatsapp_number'), ''),
      user_phone
    );
    business_type := COALESCE(NEW.raw_user_meta_data->>'business_type', 'retail');
    resolved_mode := CASE
      WHEN business_type = 'restaurant' THEN 'restaurant'
      WHEN business_type = 'workshop'   THEN 'workshop'
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

    INSERT INTO public.users (id, tenant_id, name, email, phone, whatsapp_number, role, is_active)
    VALUES (NEW.id, new_tenant_id, user_name, NEW.email, user_phone, user_whatsapp, 'vendor', true);

    INSERT INTO public.branches (tenant_id, name, is_main, is_active)
    VALUES (new_tenant_id, 'Main Branch', true, true);

    -- Phone was meant to be mandatory at the form level; if it arrived
    -- empty anyway (stale client, API path) the signup still succeeds —
    -- flag it for follow-up instead of losing the customer.
    IF user_phone IS NULL THEN
      INSERT INTO public.signup_failures (auth_user_id, email, error_message, raw_meta)
      VALUES (NEW.id, NEW.email, 'phone_missing_at_signup', NEW.raw_user_meta_data);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Don't destroy the signup — log it and let the auth account stand so
    -- its email isn't permanently burned (see 1785683005).
    INSERT INTO public.signup_failures (auth_user_id, email, error_message, raw_meta)
    VALUES (NEW.id, NEW.email, SQLERRM, NEW.raw_user_meta_data);
  END;

  RETURN NEW;
END;
$$;
