-- Platform billing: Super Admin invoices/charges tenants directly (monthly
-- BYOD fees, one-off addon charges, etc.) from the Admin portal; tenants see
-- and pay from Settings > Billing. Money flows the OPPOSITE direction from
-- documents/invoice_payments (tenant bills their own customer) -- here the
-- tenant is the payer. Reuses the existing platform-level Stripe/Paynow
-- checkout infra (signup-checkout edge function) rather than building new
-- payment plumbing, and the existing subscription_payments ledger rather
-- than a parallel one. Deliberately NOT built on signup_checkouts, whose
-- confirm_cash_signup RPC has "first activation" side effects
-- (plan_start_date/approved_at) that don't apply here.

CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  description         TEXT NOT NULL,
  amount              NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency            TEXT NOT NULL DEFAULT 'USD',
  status              TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  due_date            DATE,
  is_recurring        BOOLEAN NOT NULL DEFAULT false,
  recurrence_interval TEXT CHECK (recurrence_interval IN ('monthly', 'quarterly', 'halfyear', 'yearly')),
  next_invoice_date   DATE,
  parent_invoice_id   UUID REFERENCES public.platform_invoices(id),
  reference           TEXT UNIQUE,
  provider_session_id TEXT,
  poll_url            TEXT,
  sent_at             TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_by          UUID REFERENCES public.app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_tenant ON public.platform_invoices(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_status ON public.platform_invoices(status) WHERE status IN ('sent', 'overdue');
CREATE INDEX IF NOT EXISTS idx_platform_invoices_recurring ON public.platform_invoices(next_invoice_date) WHERE is_recurring = true;

ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_manage_platform_invoices" ON public.platform_invoices;
CREATE POLICY "app_users_manage_platform_invoices"
  ON public.platform_invoices FOR ALL
  USING (public.is_active_app_user())
  WITH CHECK (public.is_active_app_user());

-- Tenant (vendor/shop_manager only) gets SELECT only -- no UPDATE policy at
-- all, so a client can never flip their own invoice to 'paid'. Every state
-- change goes through a SECURITY DEFINER RPC or the webhook service-role key.
DROP POLICY IF EXISTS "tenant_read_own_platform_invoices" ON public.platform_invoices;
CREATE POLICY "tenant_read_own_platform_invoices"
  ON public.platform_invoices FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager']));

-- Reuse the existing payment ledger rather than a parallel one.
ALTER TABLE public.subscription_payments
  ADD COLUMN IF NOT EXISTS platform_invoice_id UUID REFERENCES public.platform_invoices(id);

-- Super Admin/Admin confirms a tenant paid a platform invoice by cash/bank
-- transfer -- mirrors confirm_cash_signup's shape, deliberately standalone.
CREATE OR REPLACE FUNCTION public.confirm_platform_invoice_cash_payment(p_invoice_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_role TEXT; inv RECORD;
BEGIN
  SELECT role INTO caller_role FROM public.app_users WHERE id = auth.uid() AND is_active = true;
  IF caller_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only platform staff can confirm payments';
  END IF;

  SELECT * INTO inv FROM public.platform_invoices WHERE id = p_invoice_id AND status IN ('sent', 'overdue') FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'No payable invoice found'; END IF;

  UPDATE public.platform_invoices SET status = 'paid', paid_at = NOW(), updated_at = NOW() WHERE id = inv.id;

  INSERT INTO public.subscription_payments (tenant_id, platform_invoice_id, provider, plan_type, amount, currency)
  VALUES (inv.tenant_id, inv.id, 'cash', 'platform_invoice', inv.amount, inv.currency);

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'platform_invoice_paid_cash', 'platform_invoice', inv.id,
    jsonb_build_object('tenant_id', inv.tenant_id, 'amount', inv.amount));
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_platform_invoice_cash_payment(UUID) TO authenticated;

-- Tenant-side "I've paid via bank transfer/cash" claim -- routed through
-- this RPC (not a direct admin_notifications insert) so the RPC's own
-- ownership check is the real gate, not that table's insert policy.
CREATE OR REPLACE FUNCTION public.request_platform_invoice_cash_confirmation(p_invoice_id UUID, p_note TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; inv RECORD; tenant_name TEXT;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager') THEN
    RAISE EXCEPTION 'Not permitted to claim a payment';
  END IF;

  SELECT * INTO inv FROM public.platform_invoices WHERE id = p_invoice_id AND tenant_id = caller_tenant AND status IN ('sent', 'overdue');
  IF inv.id IS NULL THEN RAISE EXCEPTION 'No payable invoice found'; END IF;

  SELECT name INTO tenant_name FROM public.tenants WHERE id = caller_tenant;

  INSERT INTO public.admin_notifications (type, title, body, tenant_id)
  VALUES (
    'payment_due',
    tenant_name || ' claims payment for ' || inv.description,
    COALESCE(p_note, 'No note provided') || ' — amount: ' || inv.amount || ' ' || inv.currency,
    caller_tenant
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_platform_invoice_cash_confirmation(UUID, TEXT) TO authenticated;
