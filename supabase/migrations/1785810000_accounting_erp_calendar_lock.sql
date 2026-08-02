-- Accounting & ERP calendar-based billing: monthly subscribers should lose
-- access 5 days after the 1st of a calendar month they haven't paid for.
-- Deliberately a NEW, standalone function/cron job -- does not touch
-- expire_trials()/expire_fiscal_addon's existing hourly job, purely additive.
CREATE OR REPLACE FUNCTION public.lock_expired_accounting_erp()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tenants
  SET features = features || '{"accounting_erp": false}'::jsonb, updated_at = NOW()
  WHERE accounting_erp_expires_at IS NOT NULL
    AND accounting_erp_expires_at < NOW() - INTERVAL '5 days'
    AND COALESCE(features->>'accounting_erp', 'false') = 'true';
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lock-expired-accounting-erp') THEN
    PERFORM cron.unschedule('lock-expired-accounting-erp');
  END IF;
  PERFORM cron.schedule('lock-expired-accounting-erp', '0 * * * *', 'SELECT public.lock_expired_accounting_erp()');
END $$;
