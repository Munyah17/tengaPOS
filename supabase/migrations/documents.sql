-- Quotations and invoices — a simple, light "office" document tool.
-- One table for both types (doc_type distinguishes them) since they share
-- the same shape; a quotation converts to an invoice by copying itself
-- into a new row and linking the two, rather than mutating in place, so
-- the quotation's own history stays intact.
CREATE TABLE IF NOT EXISTS public.documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  doc_type          TEXT NOT NULL CHECK (doc_type IN ('quotation', 'invoice')),
  doc_number        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'accepted', 'paid', 'cancelled')),
  customer_name     TEXT NOT NULL,
  customer_email    TEXT,
  customer_phone    TEXT,
  customer_address  TEXT,
  -- [{ description, qty, unit_price, discount_pct }] — VAT-inclusive unit
  -- prices, same convention as product prices everywhere else in the app.
  items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal          NUMERIC NOT NULL DEFAULT 0,
  vat_amount        NUMERIC NOT NULL DEFAULT 0,
  total             NUMERIC NOT NULL DEFAULT 0,
  notes             TEXT,
  valid_until       DATE,
  due_date          DATE,
  converted_from_id UUID REFERENCES public.documents(id),
  converted_to_id   UUID REFERENCES public.documents(id),
  created_by        UUID REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, doc_type, doc_number)
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant ON public.documents(tenant_id, doc_type, created_at DESC);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_tenant_access" ON public.documents;
CREATE POLICY "documents_tenant_access"
  ON public.documents FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
