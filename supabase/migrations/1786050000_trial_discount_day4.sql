-- Adjusts notify_trial_reminders() (1786030000_trial_reminder_notifications.sql)
-- per explicit follow-up instruction: the win-back discount now starts on
-- day 4 of the reminder sequence, not day 3. Days 1-3 stay a plain
-- reminder; days 4-5 get the discount offer. Redefining the whole
-- function rather than patching in place -- CREATE OR REPLACE is already
-- how it's meant to be revised.
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
        'template', CASE WHEN next_day >= 4 THEN 'trial_reminder_discount' ELSE 'trial_reminder' END,
        'extra', jsonb_build_object('day', next_day)
      )
    );

    UPDATE public.tenants
    SET trial_reminder_count = next_day,
        trial_discount_expires_at = CASE WHEN next_day = 4 THEN NOW() + INTERVAL '10 days' ELSE trial_discount_expires_at END
    WHERE id = t.id;
  END LOOP;
END;
$$;
