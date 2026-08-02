-- Email notifications on new signup and trial expiry, to both the tenant's
-- own owner email and the admin's SMTP mailbox. Purely additive:
--   1. A new AFTER INSERT trigger on tenants -- fires on every new tenant
--      row regardless of which handle_new_user() body actually created it
--      (that function has been redefined by several migrations over time;
--      hooking the tenants table itself instead of handle_new_user() avoids
--      needing to know which version is currently live).
--   2. A new, separate cron function for trial expiry -- does not touch
--      expire_trials() at all, zero risk to the existing hourly suspend
--      logic.
-- Both use the same vault-secret + pg_net pattern already established in
-- pending_change_reminder_cron.sql. If the 'service_role_key' Vault secret
-- or the SMTP_* edge function secrets aren't set up yet, these safely no-op
-- rather than erroring -- signup must never be blocked by an email hiccup.

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_expired_notified_at TIMESTAMPTZ;

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. New signup -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_new_signup_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key TEXT;
BEGIN
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF service_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-tenant-email',
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('tenant_id', NEW.id, 'template', 'new_signup')
  );
  PERFORM net.http_post(
    url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-tenant-email',
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object('tenant_id', NEW.id, 'template', 'new_signup_admin')
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let an email hiccup block or roll back the actual signup.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_signup_email ON public.tenants;
CREATE TRIGGER trg_notify_new_signup_email
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_signup_email();

-- 2. Trial expired ----------------------------------------------------------
-- Scheduled a few minutes after expire_trials() (':15' -> ':20') so it only
-- ever sees tenants already flipped to 'suspended'; trial_expired_notified_at
-- stops it from re-sending on every subsequent hourly run for the same tenant.
CREATE OR REPLACE FUNCTION public.notify_expired_trials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  service_key TEXT;
BEGIN
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF service_key IS NULL THEN RETURN; END IF;

  FOR t IN
    SELECT id FROM public.tenants
    WHERE status = 'suspended'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < NOW()
      AND plan_start_date IS NULL
      AND trial_expired_notified_at IS NULL
  LOOP
    PERFORM net.http_post(
      url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-tenant-email',
      headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object('tenant_id', t.id, 'template', 'trial_expired')
    );
    PERFORM net.http_post(
      url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-tenant-email',
      headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object('tenant_id', t.id, 'template', 'trial_expired_admin')
    );
    UPDATE public.tenants SET trial_expired_notified_at = NOW() WHERE id = t.id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-expired-trials') THEN
    PERFORM cron.unschedule('notify-expired-trials');
  END IF;
  PERFORM cron.schedule('notify-expired-trials', '20 * * * *', 'SELECT public.notify_expired_trials()');
END $$;
