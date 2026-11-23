-- Direct bank transfer and direct EcoCash/InnBucks (P2P) as signup payment
-- methods. Like cash, they are queued as 'pending_cash' and activated by
-- platform staff through confirm_cash_signup once the money is seen.
-- The pay-to details shown to the customer live in platform_settings
-- (key 'manual_payment_details'), never in the codebase.
-- Idempotent: safe to re-run by hand in the SQL editor.

ALTER TABLE public.signup_checkouts ADD COLUMN IF NOT EXISTS payer_reference TEXT;
ALTER TABLE public.signup_checkouts ADD COLUMN IF NOT EXISTS payer_name TEXT;

ALTER TABLE public.signup_checkouts DROP CONSTRAINT IF EXISTS signup_checkouts_provider_check;
ALTER TABLE public.signup_checkouts ADD CONSTRAINT signup_checkouts_provider_check
  CHECK (provider IN ('stripe', 'paynow', 'cash', 'bank_transfer', 'mobile_transfer'));

ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_provider_check;
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_provider_check
  CHECK (provider IN ('stripe', 'paynow', 'cash', 'bank_transfer', 'mobile_transfer'));

-- Same as before, except the payment is recorded under the method the
-- customer actually used (was always 'cash') with their transaction
-- reference, and byod_yearly gets its 12 months (it fell through to 6).
CREATE OR REPLACE FUNCTION public.confirm_cash_signup(p_checkout_id UUID)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role TEXT;
  checkout RECORD;
  months INT;
  now_ts TIMESTAMPTZ := NOW();
  renewal TIMESTAMPTZ;
  months_map JSONB := '{"byod_monthly":1,"byod_yearly":12,"standard_plan":6,"pro_package":6,"business":6,"enterprise":6}'::jsonb;
BEGIN
  SELECT role INTO caller_role FROM public.app_users WHERE id = auth.uid();
  IF caller_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only platform staff can confirm cash payments';
  END IF;

  SELECT * INTO checkout FROM public.signup_checkouts WHERE id = p_checkout_id AND status = 'pending_cash';
  IF checkout.id IS NULL THEN
    RAISE EXCEPTION 'No pending cash request found';
  END IF;

  months := COALESCE((months_map->>checkout.plan_type)::int, 6);
  renewal := now_ts + (months || ' months')::interval;

  UPDATE public.tenants SET
    status = 'active',
    plan_type = checkout.plan_type,
    plan_start_date = now_ts,
    next_renewal_date = renewal,
    approved_at = now_ts,
    approved_by = auth.uid()
  WHERE id = checkout.tenant_id;

  UPDATE public.signup_checkouts SET status = 'paid', updated_at = now_ts WHERE id = checkout.id;

  INSERT INTO public.subscription_payments (tenant_id, checkout_id, provider, plan_type, amount, currency)
  VALUES (checkout.tenant_id, checkout.id, checkout.provider, checkout.plan_type, checkout.amount, checkout.currency);

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'subscription_paid_cash', 'tenant', checkout.tenant_id,
    jsonb_build_object('plan_type', checkout.plan_type, 'reference', checkout.reference,
      'provider', checkout.provider, 'payer_reference', checkout.payer_reference, 'payer_name', checkout.payer_name));
END;
$function$;
