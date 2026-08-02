-- Accounting & ERP buildout: Creditors (Accounts Payable). Same
-- FOR-UPDATE-lock + overpay-guard RPC pattern as record_invoice_payment
-- (1785790000_invoice_payments.sql) -- balance computed client-side.

CREATE TABLE IF NOT EXISTS public.creditor_bills (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id  UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  bill_number  TEXT,
  description  TEXT,
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'cancelled')),
  created_by   UUID REFERENCES public.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creditor_bills_tenant ON public.creditor_bills(tenant_id, status, created_at DESC);

ALTER TABLE public.creditor_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creditor_bills_tenant_access" ON public.creditor_bills;
CREATE POLICY "creditor_bills_tenant_access"
  ON public.creditor_bills FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE TABLE IF NOT EXISTS public.creditor_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  creditor_bill_id  UUID NOT NULL REFERENCES public.creditor_bills(id) ON DELETE CASCADE,
  amount            NUMERIC NOT NULL CHECK (amount > 0),
  method            TEXT NOT NULL,
  paid_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note              TEXT,
  voided_at         TIMESTAMPTZ,
  voided_by         UUID REFERENCES public.users(id),
  created_by        UUID REFERENCES public.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_creditor_payments_bill ON public.creditor_payments(creditor_bill_id);

ALTER TABLE public.creditor_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creditor_payments_tenant_read" ON public.creditor_payments;
-- Read-only for tenant roles, same as invoice_payments -- writes only via
-- the SECURITY DEFINER RPCs below.
CREATE POLICY "creditor_payments_tenant_read"
  ON public.creditor_payments FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE OR REPLACE FUNCTION public.record_creditor_payment(
  p_creditor_bill_id UUID, p_amount NUMERIC, p_method TEXT,
  p_paid_at TIMESTAMPTZ DEFAULT NOW(), p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; bill RECORD; paid_so_far NUMERIC; new_id UUID;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not permitted to record payments';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT * INTO bill FROM public.creditor_bills WHERE id = p_creditor_bill_id AND tenant_id = caller_tenant FOR UPDATE;
  IF bill.id IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF bill.status = 'cancelled' THEN RAISE EXCEPTION 'Cannot record a payment against a cancelled bill'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO paid_so_far FROM public.creditor_payments
  WHERE creditor_bill_id = p_creditor_bill_id AND voided_at IS NULL;

  IF paid_so_far + p_amount > bill.amount THEN
    RAISE EXCEPTION 'Payment of % would exceed balance due of %', p_amount, (bill.amount - paid_so_far);
  END IF;

  INSERT INTO public.creditor_payments (tenant_id, creditor_bill_id, amount, method, paid_at, note, created_by)
  VALUES (caller_tenant, p_creditor_bill_id, p_amount, p_method, COALESCE(p_paid_at, NOW()), p_note, auth.uid())
  RETURNING id INTO new_id;

  UPDATE public.creditor_bills
  SET status = CASE WHEN paid_so_far + p_amount >= bill.amount THEN 'paid' ELSE 'partially_paid' END,
      updated_at = NOW()
  WHERE id = p_creditor_bill_id;

  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_creditor_payment(UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_creditor_payment(p_payment_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; pmt RECORD; bill RECORD; paid_so_far NUMERIC;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager') THEN
    RAISE EXCEPTION 'Not permitted to void payments';
  END IF;

  SELECT * INTO pmt FROM public.creditor_payments WHERE id = p_payment_id AND tenant_id = caller_tenant FOR UPDATE;
  IF pmt.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF pmt.voided_at IS NOT NULL THEN RAISE EXCEPTION 'Payment already voided'; END IF;

  UPDATE public.creditor_payments SET voided_at = NOW(), voided_by = auth.uid() WHERE id = p_payment_id;

  SELECT * INTO bill FROM public.creditor_bills WHERE id = pmt.creditor_bill_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO paid_so_far FROM public.creditor_payments
  WHERE creditor_bill_id = pmt.creditor_bill_id AND voided_at IS NULL;

  UPDATE public.creditor_bills
  SET status = CASE WHEN paid_so_far = 0 THEN 'unpaid' WHEN paid_so_far < bill.amount THEN 'partially_paid' ELSE 'paid' END,
      updated_at = NOW()
  WHERE id = bill.id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.void_creditor_payment(UUID) TO authenticated;
