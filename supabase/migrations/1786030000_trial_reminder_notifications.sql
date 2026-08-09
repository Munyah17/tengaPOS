-- Reported live: only the admin's own SMTP mailbox was reliably getting the
-- trial-expired heads-up (notify_expired_trials(), a ONE-TIME send guarded
-- by trial_expired_notified_at) -- the tenant-facing copy of that same
-- one-shot email wasn't landing. Rather than debug a single fire-and-forget
-- send, this adds a proper daily reminder sequence to the tenant, separate
-- from and additive to the existing one-time notify_expired_trials() (which
-- is untouched -- the admin heads-up keeps working exactly as it does now):
--   - Days 1-2 after suspension: plain reminder the trial ended.
--   - Days 3-5: same reminder + an automatic 10% discount, valid for a
--     further 10 days from when it's first offered -- no promo code to
--     type in, signup-checkout and Checkout.jsx both read
--     trial_discount_expires_at directly off the tenant.
--   - Stops after 5 reminders (trial_reminder_count caps at 5) or the
--     moment plan_start_date is set (they paid).

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_reminder_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS trial_discount_expires_at TIMESTAMPTZ;

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_trial_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  service_key TEXT;
  next_day INTEGER;
BEGIN
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF service_key IS NULL THEN RETURN; END IF;

  FOR t IN
    SELECT id, trial_reminder_count FROM public.tenants
    WHERE status = 'suspended'
      AND trial_ends_at IS NOT NULL
      AND trial_ends_at < NOW()
      AND plan_start_date IS NULL
      AND trial_reminder_count < 5
  LOOP
    next_day := t.trial_reminder_count + 1;

    PERFORM net.http_post(
      url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-tenant-email',
      headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'tenant_id', t.id,
        'template', CASE WHEN next_day >= 3 THEN 'trial_reminder_discount' ELSE 'trial_reminder' END,
        'extra', jsonb_build_object('day', next_day)
      )
    );

    UPDATE public.tenants
    SET trial_reminder_count = next_day,
        trial_discount_expires_at = CASE WHEN next_day = 3 THEN NOW() + INTERVAL '10 days' ELSE trial_discount_expires_at END
    WHERE id = t.id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-trial-reminders') THEN
    PERFORM cron.unschedule('notify-trial-reminders');
  END IF;
  -- Once daily, well clear of the hourly :15/:20 expiry jobs.
  PERFORM cron.schedule('notify-trial-reminders', '30 8 * * *', 'SELECT public.notify_trial_reminders()');
END $$;
