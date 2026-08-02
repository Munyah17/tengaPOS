-- Self-service cleanup for a tenant testing the app before going live --
-- Vendor-only, scoped to their own tenant and a date range. p_dry_run=true
-- (the default) only counts what would be deleted, so the UI can show a
-- preview before the destructive call. Deletes in FK-safe order; voids and
-- returns cascade automatically (ON DELETE CASCADE on their order_id), and
-- documents.converted_from_id/converted_to_id already SET NULL rather than
-- block (see 1785920000_documents_delete_fk_fix.sql).
CREATE OR REPLACE FUNCTION public.delete_test_transactions(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ, p_dry_run BOOLEAN DEFAULT true)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_orders INT;
  v_transactions INT;
  v_documents INT;
  v_job_cards INT;
BEGIN
  IF get_user_role() != 'vendor' THEN
    RAISE EXCEPTION 'Only the Vendor can delete test data';
  END IF;
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'A date range is required';
  END IF;

  v_tenant_id := get_user_tenant_id();

  SELECT COUNT(*) INTO v_orders FROM public.orders WHERE tenant_id = v_tenant_id AND created_at BETWEEN p_from AND p_to;
  SELECT COUNT(*) INTO v_transactions FROM public.transactions WHERE tenant_id = v_tenant_id AND created_at BETWEEN p_from AND p_to;
  SELECT COUNT(*) INTO v_documents FROM public.documents WHERE tenant_id = v_tenant_id AND created_at BETWEEN p_from AND p_to;
  SELECT COUNT(*) INTO v_job_cards FROM public.job_cards WHERE tenant_id = v_tenant_id AND created_at BETWEEN p_from AND p_to;

  IF NOT p_dry_run THEN
    DELETE FROM public.order_items WHERE order_id IN (
      SELECT id FROM public.orders WHERE tenant_id = v_tenant_id AND created_at BETWEEN p_from AND p_to
    );
    DELETE FROM public.transactions WHERE tenant_id = v_tenant_id AND created_at BETWEEN p_from AND p_to;
    DELETE FROM public.orders WHERE tenant_id = v_tenant_id AND created_at BETWEEN p_from AND p_to;
    DELETE FROM public.documents WHERE tenant_id = v_tenant_id AND created_at BETWEEN p_from AND p_to;
    DELETE FROM public.job_cards WHERE tenant_id = v_tenant_id AND created_at BETWEEN p_from AND p_to;
  END IF;

  RETURN jsonb_build_object(
    'orders', v_orders, 'transactions', v_transactions,
    'documents', v_documents, 'job_cards', v_job_cards
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_test_transactions(TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;
