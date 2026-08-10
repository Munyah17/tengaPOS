-- Trial-reminder sequence now also fires over WhatsApp (send-whatsapp-
-- notification), alongside the existing email leg -- purely additive,
-- best-effort: a WhatsApp send failing/not-yet-configured never blocks or
-- reverts the email send or the reminder-count increment. Redefines
-- notify_trial_reminders() once more (see 1786030000/1786050000).
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
  template_key TEXT;
BEGIN
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF service_key IS NULL THEN RETURN; END IF;

  FOR t IN
    SELECT tn.id, tn.name, tn.trial_reminder_count,
           (SELECT u.whatsapp_number FROM public.users u
            WHERE u.tenant_id = tn.id AND u.role = 'vendor' AND u.is_active = true
            LIMIT 1) AS whatsapp_number
    FROM public.tenants tn
    WHERE tn.status = 'suspended'
      AND tn.trial_ends_at IS NOT NULL
      AND tn.trial_ends_at < NOW()
      AND tn.plan_start_date IS NULL
      AND tn.trial_reminder_count < 5
  LOOP
    next_day := t.trial_reminder_count + 1;
    template_key := CASE WHEN next_day >= 4 THEN 'trial_reminder_discount' ELSE 'trial_reminder' END;

    PERFORM net.http_post(
      url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-tenant-email',
      headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object('tenant_id', t.id, 'template', template_key, 'extra', jsonb_build_object('day', next_day))
    );

    IF t.whatsapp_number IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-whatsapp-notification',
        headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'phone', t.whatsapp_number,
          'template', template_key,
          'template_params', jsonb_build_array(t.name, next_day::text)
        )
      );
    END IF;

    UPDATE public.tenants
    SET trial_reminder_count = next_day,
        trial_discount_expires_at = CASE WHEN next_day = 4 THEN NOW() + INTERVAL '10 days' ELSE trial_discount_expires_at END
    WHERE id = t.id;
  END LOOP;
END;
$$;
