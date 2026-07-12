-- expire_trials now also revokes lapsed fiscalisation add-ons (runs hourly via pg_cron)
CREATE OR REPLACE FUNCTION public.expire_trials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tenants
  SET status = 'suspended', updated_at = NOW()
  WHERE status = 'active'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < NOW()
    AND plan_start_date IS NULL;

  UPDATE public.tenants
  SET features = features || '{"fiscalisation": false}'::jsonb, updated_at = NOW()
  WHERE fiscal_expires_at IS NOT NULL
    AND fiscal_expires_at < NOW()
    AND COALESCE(features->>'fiscalisation', 'false') = 'true';
END;
$$;
