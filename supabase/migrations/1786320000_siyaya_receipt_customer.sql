-- Optional receipt snapshots for Siyaya FitActive only. Keep the existing
-- checkout RPC intact so all other tenants and older clients are unaffected.
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_details JSONB;

CREATE OR REPLACE FUNCTION public.process_checkout_with_customer(
  p_tenant_id UUID, p_branch_id UUID, p_user_id UUID, p_receipt_no TEXT,
  p_status TEXT, p_type TEXT, p_pos_mode TEXT, p_subtotal NUMERIC, p_tax NUMERIC,
  p_discount NUMERIC, p_total NUMERIC, p_payment_method TEXT, p_items JSONB,
  p_customer_details JSONB,
  p_salesperson_name TEXT DEFAULT NULL, p_salesperson_employee_no TEXT DEFAULT NULL,
  p_client_ref UUID DEFAULT NULL, p_discount_auth_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result JSONB;
  customer JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND tenant_id = p_tenant_id AND is_active = true AND is_locked = false) THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND slug = 'siyaya-fit-271e5024') THEN
    RAISE EXCEPTION 'Customer receipt details are not enabled for this tenant';
  END IF;
  IF jsonb_typeof(p_customer_details) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid customer details';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_customer_details) AS field
    WHERE field.key NOT IN ('name', 'phone', 'email') OR jsonb_typeof(field.value) <> 'string'
  ) OR length(p_customer_details->>'name') > 120
    OR length(p_customer_details->>'phone') > 40
    OR length(p_customer_details->>'email') > 254 THEN
    RAISE EXCEPTION 'Invalid customer details';
  END IF;
  customer := jsonb_strip_nulls(jsonb_build_object(
    'name', NULLIF(btrim(regexp_replace(p_customer_details->>'name', '[[:cntrl:]]', '', 'g')), ''),
    'phone', NULLIF(btrim(regexp_replace(p_customer_details->>'phone', '[[:cntrl:]]', '', 'g')), ''),
    'email', NULLIF(btrim(regexp_replace(p_customer_details->>'email', '[[:cntrl:]]', '', 'g')), '')
  ));
  -- Both operations share one transaction. The original RPC retains stock,
  -- pricing, authorization and idempotency checks; a snapshot failure rolls
  -- back the entire sale rather than leaving a partial checkout.
  result := public.process_checkout(
    p_tenant_id, p_branch_id, p_user_id, p_receipt_no, p_status, p_type,
    p_pos_mode, p_subtotal, p_tax, p_discount, p_total, p_payment_method,
    p_items, p_salesperson_name, p_salesperson_employee_no, p_client_ref,
    p_discount_auth_id
  );
  UPDATE public.orders SET customer_details = NULLIF(customer, '{}'::jsonb)
  WHERE id = (result->>'order_id')::UUID AND tenant_id = p_tenant_id
    AND customer_details IS NULL;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.process_checkout_with_customer(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB, JSONB, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_checkout_with_customer(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB, JSONB, TEXT, TEXT, UUID, UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
