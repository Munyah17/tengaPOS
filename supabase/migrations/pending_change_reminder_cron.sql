-- Daily 07:00 digest email to each Vendor with config changes still
-- awaiting their approval (send-tenant-email, mode=daily_digest). Inert
-- until SMTP_* secrets are set on the edge function — it'll just no-op.
--
-- The service-role key the cron job needs to call the edge function lives
-- in Supabase Vault (`select vault.create_secret(<key>, 'service_role_key', ...)`
-- — run once, outside this file, never committed to source) rather than
-- hardcoded here.
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pending-change-reminders') THEN
    PERFORM cron.unschedule('pending-change-reminders');
  END IF;
  PERFORM cron.schedule(
    'pending-change-reminders',
    '0 7 * * *',
    $cron$
    select net.http_post(
      url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-tenant-email',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{"mode":"daily_digest"}'::jsonb
    )
    $cron$
  );
END $$;
