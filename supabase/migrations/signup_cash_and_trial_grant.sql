-- 1. Cash as a third signup payment option: request goes to Super Admin's
--    queue instead of a hosted checkout redirect.
-- 2. A server-side RPC for Super Admin to confirm a pending cash payment
--    (activates the plan, same effect as the Paynow/Stripe webhooks) and
--    one to grant a 7-day free trial directly, without the tenant self-
--    serving it from Checkout.jsx -- both were previously only reachable
--    by the tenant themselves.

ALTER TABLE public.signup_checkouts DROP CONSTRAINT IF EXISTS signup_checkouts_provider_check;
ALTER TABLE public.signup_checkouts ADD CONSTRAINT signup_checkouts_provider_check
  CHECK (provider IN ('stripe', 'paynow', 'cash'));

ALTER TABLE public.signup_checkouts DROP CONSTRAINT IF EXISTS signup_checkouts_status_check;
ALTER TABLE public.signup_checkouts ADD CONSTRAINT signup_checkouts_status_check
  CHECK (status IN ('created', 'redirected', 'pending_cash', 'paid', 'trialing', 'failed', 'cancelled'));

ALTER TABLE public.subscription_payments DROP CONSTRAINT IF EXISTS subscription_payments_provider_check;
ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_provider_check
  CHECK (provider IN ('stripe', 'paynow', 'cash'));

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
  months_map JSONB := '{"byod_monthly":1,"standard_plan":6,"pro_package":6,"business":6,"enterprise":6}'::jsonb;
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
  VALUES (checkout.tenant_id, checkout.id, 'cash', checkout.plan_type, checkout.amount, checkout.currency);

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'subscription_paid_cash', 'tenant', checkout.tenant_id,
    jsonb_build_object('plan_type', checkout.plan_type, 'reference', checkout.reference));
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_free_trial(p_tenant_id UUID)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role TEXT;
  t RECORD;
BEGIN
  SELECT role INTO caller_role FROM public.app_users WHERE id = auth.uid();
  IF caller_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Only platform staff can grant a free trial';
  END IF;

  SELECT * INTO t FROM public.tenants WHERE id = p_tenant_id;
  IF t.plan_start_date IS NOT NULL THEN
    RAISE EXCEPTION 'This business already has an active plan';
  END IF;
  IF t.trial_ends_at IS NOT NULL THEN
    RAISE EXCEPTION 'The free trial has already been used for this business';
  END IF;

  UPDATE public.tenants SET status = 'active', trial_ends_at = NOW() + INTERVAL '7 days' WHERE id = p_tenant_id;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'trial_granted_by_admin', 'tenant', p_tenant_id, jsonb_build_object('tenant_name', t.name));
END;
$function$;
