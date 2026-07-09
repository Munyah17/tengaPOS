-- ZIMRA fiscal config additions
-- Tracks when the fiscal day was opened so closeDay can include the correct
-- fiscalDayOpened timestamp required by FDMS v7.2 API spec.

ALTER TABLE public.tenant_fiscal_configs
  ADD COLUMN IF NOT EXISTS fiscal_day_opened_at TIMESTAMPTZ;

-- Normalise legacy 'FiscalDayClosed' default to 'closed' for consistency
UPDATE public.tenant_fiscal_configs
  SET fiscal_day_status = 'closed'
  WHERE fiscal_day_status = 'FiscalDayClosed';

ALTER TABLE public.tenant_fiscal_configs
  ALTER COLUMN fiscal_day_status SET DEFAULT 'closed';
