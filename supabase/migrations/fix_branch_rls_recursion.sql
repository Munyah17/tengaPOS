-- URGENT FIX: branch_isolation.sql introduced infinite recursion.
-- tenant_read_own_product_branches queried products directly, and
-- branch_scope_products (on products) queries product_branches directly —
-- each table's RLS policy triggered the other's, recursing forever
-- ("infinite recursion detected in policy for relation products"), which
-- broke every product fetch for every non-vendor account (cashier/shop
-- manager) on both POS and Inventory.
--
-- Fix: route the cross-table tenant check through a SECURITY DEFINER
-- function (same proven pattern as get_user_tenant_id() etc. elsewhere in
-- this schema) so the check runs bypassing RLS instead of re-triggering it.

CREATE OR REPLACE FUNCTION public.product_in_my_tenant(p_product_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id AND tenant_id = public.get_user_tenant_id()
  );
$$;

CREATE OR REPLACE FUNCTION public.user_in_my_tenant(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_user_id AND tenant_id = public.get_user_tenant_id()
  );
$$;

DROP POLICY IF EXISTS "tenant_read_own_product_branches" ON public.product_branches;
CREATE POLICY "tenant_read_own_product_branches"
  ON public.product_branches FOR SELECT
  USING (public.product_in_my_tenant(product_id));

DROP POLICY IF EXISTS "tenant_read_own_user_branches" ON public.user_branches;
CREATE POLICY "tenant_read_own_user_branches"
  ON public.user_branches FOR SELECT
  USING (public.user_in_my_tenant(user_id));
