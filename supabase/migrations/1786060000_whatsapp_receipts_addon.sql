-- WhatsApp Receipts paid add-on ($5/month, $50/year) -- push a PDF receipt
-- straight to a customer's WhatsApp, and (separately, see notify_trial_
-- reminders below) lets automated tenant-facing notifications go out over
-- WhatsApp as well as email. Mirrors accounting_erp/ai_insights' existing
-- add-on shape exactly: a features flag + an expiry timestamp, unlocked by
-- signup-checkout/the payment webhooks, auto-locked by its own standalone
-- cron (same lock_expired_accounting_erp pattern).

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS whatsapp_receipts_expires_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.lock_expired_whatsapp_receipts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tenants
  SET features = features || '{"whatsapp_receipts": false}'::jsonb, updated_at = NOW()
  WHERE whatsapp_receipts_expires_at IS NOT NULL
    AND whatsapp_receipts_expires_at < NOW() - INTERVAL '5 days'
    AND COALESCE(features->>'whatsapp_receipts', 'false') = 'true';
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lock-expired-whatsapp-receipts') THEN
    PERFORM cron.unschedule('lock-expired-whatsapp-receipts');
  END IF;
  PERFORM cron.schedule('lock-expired-whatsapp-receipts', '0 * * * *', 'SELECT public.lock_expired_whatsapp_receipts()');
END $$;

-- ─── Mandatory WhatsApp Number at signup ───────────────────────────────────
-- Same reasoning as phone (1785960000_signup_phone_mandatory.sql): kept as
-- its own column rather than reusing phone, since a business's WhatsApp
-- number is often a different line than its office/landline number in
-- practice, and this is now a real outreach channel (trial-conversion
-- follow-ups, Marketing Database contact) that needs to be right.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

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
  user_whatsapp TEXT;
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

  user_whatsapp := NULLIF(TRIM(NEW.raw_user_meta_data->>'whatsapp_number'), '');
  IF user_whatsapp IS NULL THEN
    RAISE EXCEPTION 'WhatsApp number is required to sign up.';
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

    INSERT INTO public.users (id, tenant_id, name, email, phone, whatsapp_number, role, is_active)
    VALUES (NEW.id, new_tenant_id, user_name, NEW.email, user_phone, user_whatsapp, 'vendor', true);

    INSERT INTO public.branches (tenant_id, name, is_main, is_active)
    VALUES (new_tenant_id, 'Main Branch', true, true);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.signup_failures (auth_user_id, email, error_message, raw_meta)
    VALUES (NEW.id, NEW.email, SQLERRM, NEW.raw_user_meta_data);
  END;

  RETURN NEW;
END;
$$;

-- ─── Storage: private, tenant-scoped PDF receipts ──────────────────────────
-- Not public like product-images -- these are real customer purchase
-- records. send-whatsapp-receipt (service role) mints a short-lived signed
-- URL per send instead; nothing here is ever fetchable by a bare public URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tenant_upload_receipts" ON storage.objects;
CREATE POLICY "tenant_upload_receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_read_receipts" ON storage.objects;
CREATE POLICY "tenant_read_receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_delete_receipts" ON storage.objects;
CREATE POLICY "tenant_delete_receipts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );
