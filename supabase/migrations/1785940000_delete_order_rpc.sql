-- Simple, direct per-record delete for the Vendor -- a scalpel next to the
-- date-range "Delete Test Data" tool (1785930000), for when they just want
-- to remove one specific order/transaction rather than a whole range.
-- A dedicated RPC rather than a raw client-side delete since orders/
-- transactions predate this app's tracked migrations and their exact
-- DELETE-permission RLS isn't visible from the repo -- this makes the
-- "Vendor only" rule explicit and doesn't depend on guessing it right.
CREATE OR REPLACE FUNCTION public.delete_order(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF get_user_role() != 'vendor' THEN
    RAISE EXCEPTION 'Only the Vendor can delete an order';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.orders WHERE id = p_order_id AND tenant_id = get_user_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  DELETE FROM public.transactions WHERE order_id = p_order_id;
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_order(UUID) TO authenticated;
