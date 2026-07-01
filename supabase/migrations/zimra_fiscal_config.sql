-- ZIMRA per-tenant fiscal configuration
-- Each vendor (tenant) has their own ZIMRA fiscal device credentials.
-- Settings are stored in the DB so switching users/browsers never leaks credentials.

CREATE TABLE IF NOT EXISTS public.tenant_fiscal_configs (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID          NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- ZIMRA device credentials (entered by vendor in Settings → ZIMRA Fiscal)
  device_id                 TEXT,
  activation_key            TEXT,
  device_serial_no          TEXT,
  device_model_name         TEXT          DEFAULT 'tengaPOS-v2',
  device_model_version_no   TEXT          DEFAULT '2.0.0',

  -- Taxpayer info
  tin                       TEXT,
  vat_number                TEXT,

  -- Branch info
  branch_name               TEXT,
  branch_address            TEXT,
  branch_contacts           TEXT,

  -- Flags
  is_enabled                BOOLEAN       NOT NULL DEFAULT FALSE,
  is_registered             BOOLEAN       NOT NULL DEFAULT FALSE,
  certificate_valid_till    TIMESTAMPTZ,
  qr_url                    TEXT          DEFAULT 'https://www.zimra.co.zw/verify',

  -- Runtime counters (updated per-session; also tracked in client Zustand for speed)
  fiscal_day_status         TEXT          NOT NULL DEFAULT 'FiscalDayClosed',
  fiscal_day_no             INTEGER       NOT NULL DEFAULT 0,
  last_receipt_global_no    INTEGER       NOT NULL DEFAULT 0,
  last_receipt_hash         TEXT          DEFAULT '',

  created_at                TIMESTAMPTZ   DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_fiscal_configs_tenant ON public.tenant_fiscal_configs(tenant_id);

-- RLS: tenant users can only read/write their own fiscal config
ALTER TABLE public.tenant_fiscal_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_own_fiscal"
  ON public.tenant_fiscal_configs FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "tenant_write_own_fiscal"
  ON public.tenant_fiscal_configs FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "tenant_update_own_fiscal"
  ON public.tenant_fiscal_configs FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- Service role (edge functions) can read/update all fiscal configs
CREATE POLICY "service_read_fiscal"
  ON public.tenant_fiscal_configs FOR SELECT
  USING (true);

CREATE POLICY "service_update_fiscal"
  ON public.tenant_fiscal_configs FOR UPDATE
  USING (true);
