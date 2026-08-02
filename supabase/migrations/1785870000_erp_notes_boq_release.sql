-- Accounting & ERP buildout: Credit/Debit Notes, Bill of Quantities, Release
-- Notes. Deliberately their own tables rather than reusing the live
-- documents/Invoicing engine, to avoid any risk to that already
-- payment-integrated system.

CREATE TABLE IF NOT EXISTS public.credit_debit_notes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  note_type             TEXT NOT NULL CHECK (note_type IN ('credit', 'debit')),
  party_type            TEXT NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  customer_id           UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id           UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reference_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  note_number           TEXT,
  reason                TEXT,
  amount                NUMERIC NOT NULL CHECK (amount > 0),
  created_by            UUID REFERENCES public.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_debit_notes_tenant ON public.credit_debit_notes(tenant_id, created_at DESC);

ALTER TABLE public.credit_debit_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credit_debit_notes_tenant_access" ON public.credit_debit_notes;
CREATE POLICY "credit_debit_notes_tenant_access"
  ON public.credit_debit_notes FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE TABLE IF NOT EXISTS public.boq_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  boq_number  TEXT,
  title       TEXT NOT NULL,
  client_name TEXT,
  -- [{ description, unit, qty, rate, amount }]
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  total       NUMERIC NOT NULL DEFAULT 0,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_boq_documents_tenant ON public.boq_documents(tenant_id, created_at DESC);

ALTER TABLE public.boq_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boq_documents_tenant_access" ON public.boq_documents;
CREATE POLICY "boq_documents_tenant_access"
  ON public.boq_documents FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

-- Tracking only -- does NOT touch products.stock_qty, to avoid any risk of
-- double-touching stock logic already owned by POS/checkout.
CREATE TABLE IF NOT EXISTS public.release_notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  release_number TEXT,
  customer_id    UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  issued_to      TEXT,
  -- [{ description, qty, unit }]
  items          JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'released')),
  issued_by      UUID REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_release_notes_tenant ON public.release_notes(tenant_id, created_at DESC);

ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "release_notes_tenant_access" ON public.release_notes;
CREATE POLICY "release_notes_tenant_access"
  ON public.release_notes FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
