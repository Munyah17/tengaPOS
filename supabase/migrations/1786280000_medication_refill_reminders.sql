-- Chronic-medication refill reminders (e.g. every 28 days for BP/ARV-type
-- medication). Reuses the existing daily-digest cron + dual-channel
-- notification infra (see pending_change_reminder_cron.sql /
-- 1786070000_trial_reminder_whatsapp.sql) instead of inventing a new
-- delivery mechanism -- reminds the patient directly over WhatsApp when a
-- phone number is on file, and always fires a staff-facing email too.
--
-- Due date is computed at cron time, not stored, from the real dispense
-- history -- a stored "next_due" column would go stale the moment a refill
-- happens through any path other than this table noticing.
CREATE TABLE IF NOT EXISTS public.medication_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  frequency_days INT NOT NULL CHECK (frequency_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_reminded_at DATE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medication_schedules_tenant ON public.medication_schedules(tenant_id, is_active);

ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medication_schedules_access" ON public.medication_schedules;
CREATE POLICY "medication_schedules_access"
  ON public.medication_schedules
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));

CREATE OR REPLACE FUNCTION public.notify_medication_refills()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  service_key TEXT;
  next_due DATE;
BEGIN
  SELECT decrypted_secret INTO service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF service_key IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT ms.id, ms.tenant_id, ms.frequency_days, ms.last_reminded_at,
           c.name AS customer_name, c.phone AS customer_phone,
           p.name AS product_name,
           (SELECT MAX(pd.created_at) FROM public.prescription_dispenses pd
            WHERE pd.customer_id = ms.customer_id AND pd.product_id = ms.product_id) AS last_dispensed_at
    FROM public.medication_schedules ms
    JOIN public.customers c ON c.id = ms.customer_id
    JOIN public.products p ON p.id = ms.product_id
    WHERE ms.is_active = true
      AND (ms.last_reminded_at IS NULL OR ms.last_reminded_at < CURRENT_DATE)
  LOOP
    -- No dispense on record yet for this schedule -- nothing to base a due
    -- date on, so skip until at least one real dispense has happened.
    IF r.last_dispensed_at IS NULL THEN CONTINUE; END IF;

    next_due := (r.last_dispensed_at::date) + (r.frequency_days || ' days')::interval;
    IF next_due > CURRENT_DATE THEN CONTINUE; END IF;

    PERFORM net.http_post(
      url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-tenant-email',
      headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'tenant_id', r.tenant_id, 'template', 'medication_refill_reminder',
        'extra', jsonb_build_object('customer_name', r.customer_name, 'product_name', r.product_name)
      )
    );

    IF r.customer_phone IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://ajxephsnqdepupxkvlji.supabase.co/functions/v1/send-whatsapp-notification',
        headers := jsonb_build_object('Authorization', 'Bearer ' || service_key, 'Content-Type', 'application/json'),
        body := jsonb_build_object(
          'phone', r.customer_phone,
          'template', 'medication_refill_reminder',
          'template_params', jsonb_build_array(r.customer_name, r.product_name)
        )
      );
    END IF;

    UPDATE public.medication_schedules SET last_reminded_at = CURRENT_DATE WHERE id = r.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_medication_refills() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'medication-refill-reminders') THEN
    PERFORM cron.unschedule('medication-refill-reminders');
  END IF;
  PERFORM cron.schedule(
    'medication-refill-reminders',
    '0 8 * * *',
    $cron$ SELECT public.notify_medication_refills(); $cron$
  );
END $$;
