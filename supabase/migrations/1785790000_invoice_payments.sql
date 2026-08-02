-- Invoice payments + client statements. documents.status was previously a
-- manual all-or-nothing flip to 'paid' with no partial-payment tracking and
-- no reliable link back to a customer record (customer_name/email/phone
-- were denormalized text only, even though findOrCreateCustomer() already
-- best-effort links/creates a real customers row on every save -- its
-- returned id was just never stored back onto the document). This adds
-- that link plus a real payment ledger.

-- 1. Link documents to customers -------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_customer ON public.documents(customer_id);

-- One-off backfill for existing rows, mirroring findOrCreateCustomer's own
-- phone-then-name matching. Rows that still don't match stay NULL -- the
-- Statements page surfaces an "unlinked invoices" count rather than
-- blocking on 100% coverage.
UPDATE public.documents d SET customer_id = c.id
FROM public.customers c
WHERE d.customer_id IS NULL AND c.tenant_id = d.tenant_id
  AND d.customer_phone IS NOT NULL AND d.customer_phone = c.phone;

UPDATE public.documents d SET customer_id = c.id
FROM public.customers c
WHERE d.customer_id IS NULL AND c.tenant_id = d.tenant_id
  AND d.customer_name = c.name;

-- 2. Payment ledger ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id  UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL,
  paid_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note         TEXT,
  voided_at    TIMESTAMPTZ,
  voided_by    UUID REFERENCES public.users(id),
  created_by   UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_document ON public.invoice_payments(document_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_tenant   ON public.invoice_payments(tenant_id, paid_at DESC);

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_payments_tenant_read" ON public.invoice_payments;

-- Read-only for tenant roles by design -- no INSERT/UPDATE policy at all.
-- Writes only ever happen through the SECURITY DEFINER RPCs below, which
-- run as the function owner and bypass RLS, so a client can never insert a
-- payment directly and skip the overpay guard / FOR UPDATE lock.
CREATE POLICY "invoice_payments_tenant_read"
  ON public.invoice_payments FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

-- 3. Record a payment ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_document_id UUID, p_amount NUMERIC, p_method TEXT,
  p_paid_at TIMESTAMPTZ DEFAULT NOW(), p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; doc RECORD; paid_so_far NUMERIC; new_id UUID;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not permitted to record payments';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  -- Row lock serializes concurrent payments against the same invoice --
  -- closes the race where two simultaneous partial payments both read the
  -- balance before either commits.
  SELECT * INTO doc FROM public.documents WHERE id = p_document_id AND tenant_id = caller_tenant FOR UPDATE;
  IF doc.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF doc.doc_type != 'invoice' THEN RAISE EXCEPTION 'Payments can only be recorded against invoices'; END IF;
  IF doc.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot record a payment against a cancelled invoice'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO paid_so_far FROM public.invoice_payments
  WHERE document_id = p_document_id AND voided_at IS NULL;

  IF paid_so_far + p_amount > doc.total THEN
    RAISE EXCEPTION 'Payment of % would exceed balance due of %', p_amount, (doc.total - paid_so_far);
  END IF;

  INSERT INTO public.invoice_payments (tenant_id, document_id, amount, method, paid_at, note, created_by)
  VALUES (caller_tenant, p_document_id, p_amount, p_method, COALESCE(p_paid_at, NOW()), p_note, auth.uid())
  RETURNING id INTO new_id;

  IF paid_so_far + p_amount >= doc.total THEN
    UPDATE public.documents SET status = 'paid', updated_at = NOW() WHERE id = p_document_id;
  END IF;

  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

-- 4. Void a payment ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_invoice_payment(p_payment_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; pmt RECORD; doc RECORD; paid_so_far NUMERIC;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager') THEN
    RAISE EXCEPTION 'Not permitted to void payments';
  END IF;

  SELECT * INTO pmt FROM public.invoice_payments WHERE id = p_payment_id AND tenant_id = caller_tenant FOR UPDATE;
  IF pmt.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF pmt.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Payment already voided'; END IF;

  UPDATE public.invoice_payments SET voided_at = NOW(), voided_by = auth.uid() WHERE id = p_payment_id;

  SELECT * INTO doc FROM public.documents WHERE id = pmt.document_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO paid_so_far FROM public.invoice_payments
  WHERE document_id = pmt.document_id AND voided_at IS NULL;

  IF doc.status = 'paid' AND paid_so_far < doc.total THEN
    UPDATE public.documents SET status = 'sent', updated_at = NOW() WHERE id = doc.id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.void_invoice_payment(UUID) TO authenticated;
