-- Branch isolation: a shop_manager or cashier is bound to their one "home"
-- branch (users.branch_id, already existed) unless manually granted extra
-- branches here. Same idea for products — attached to one branch by
-- default, extra branches granted the same way. Only Vendor bypasses this
-- and sees everything centrally, matching how the business owner role has
-- always worked.
--
-- Existing rows with no branch_id (or no grants) stay visible to everyone
-- in the tenant exactly as before — this only starts restricting visibility
-- once something is actually assigned to a specific branch, so it can't
-- suddenly hide a live tenant's current data.

-- orders.branch_id and transactions.branch_id already exist; products needs
-- the same column to support per-branch attachment.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE TABLE IF NOT EXISTS public.user_branches (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  branch_id  UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, branch_id)
);
ALTER TABLE public.user_branches ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.product_branches (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id  UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, branch_id)
);
ALTER TABLE public.product_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_own_user_branches" ON public.user_branches;
CREATE POLICY "tenant_read_own_user_branches"
  ON public.user_branches FOR SELECT
  USING (user_id IN (SELECT id FROM public.users WHERE tenant_id = public.get_user_tenant_id()));

DROP POLICY IF EXISTS "tenant_read_own_product_branches" ON public.product_branches;
CREATE POLICY "tenant_read_own_product_branches"
  ON public.product_branches FOR SELECT
  USING (product_id IN (SELECT id FROM public.products WHERE tenant_id = public.get_user_tenant_id()));

-- The set of branch ids the calling user can act in: their home branch plus
-- any extra grants. Vendors are checked separately (they bypass entirely).
CREATE OR REPLACE FUNCTION public.get_user_branch_ids()
RETURNS SETOF UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT branch_id FROM public.users WHERE id = auth.uid() AND branch_id IS NOT NULL AND is_locked = false
  UNION
  SELECT branch_id FROM public.user_branches WHERE user_id = auth.uid();
$$;

-- RESTRICTIVE policies AND with whatever permissive tenant-isolation policy
-- already exists on these tables (not tracked in this repo's migrations,
-- set up directly at project setup) — so this narrows visibility without
-- needing to know or touch that existing policy's exact definition.

DROP POLICY IF EXISTS "branch_scope_products" ON public.products;
CREATE POLICY "branch_scope_products"
  ON public.products
  AS RESTRICTIVE
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'vendor')
    OR (
      products.branch_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.product_branches pb WHERE pb.product_id = products.id)
    )
    OR products.branch_id IN (SELECT public.get_user_branch_ids())
    OR EXISTS (
      SELECT 1 FROM public.product_branches pb
      WHERE pb.product_id = products.id AND pb.branch_id IN (SELECT public.get_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "branch_scope_orders" ON public.orders;
CREATE POLICY "branch_scope_orders"
  ON public.orders
  AS RESTRICTIVE
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'vendor')
    OR orders.branch_id IS NULL
    OR orders.branch_id IN (SELECT public.get_user_branch_ids())
  );

DROP POLICY IF EXISTS "branch_scope_transactions" ON public.transactions;
CREATE POLICY "branch_scope_transactions"
  ON public.transactions
  AS RESTRICTIVE
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'vendor')
    OR transactions.branch_id IS NULL
    OR transactions.branch_id IN (SELECT public.get_user_branch_ids())
  );

-- ─── Assignment RPCs — vendor or shop_manager only, tenant-scoped ───

CREATE OR REPLACE FUNCTION public.assign_user_branch(p_user_id UUID, p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  target_tenant UUID;
  branch_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager') THEN
    RAISE EXCEPTION 'Only the business owner or a shop manager can assign branches';
  END IF;

  SELECT tenant_id INTO target_tenant FROM public.users WHERE id = p_user_id;
  SELECT tenant_id INTO branch_tenant FROM public.branches WHERE id = p_branch_id;
  IF target_tenant IS NULL OR target_tenant != caller_tenant OR branch_tenant IS NULL OR branch_tenant != caller_tenant THEN
    RAISE EXCEPTION 'User or branch not found in your business';
  END IF;

  INSERT INTO public.user_branches (user_id, branch_id) VALUES (p_user_id, p_branch_id)
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_user_branch(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_user_branch(p_user_id UUID, p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager') THEN
    RAISE EXCEPTION 'Only the business owner or a shop manager can modify branch assignments';
  END IF;

  DELETE FROM public.user_branches
  WHERE user_id = p_user_id AND branch_id = p_branch_id
    AND user_id IN (SELECT id FROM public.users WHERE tenant_id = caller_tenant);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unassign_user_branch(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_product_branch(p_product_id UUID, p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  product_tenant UUID;
  branch_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager') THEN
    RAISE EXCEPTION 'Only the business owner or a shop manager can assign branches';
  END IF;

  SELECT tenant_id INTO product_tenant FROM public.products WHERE id = p_product_id;
  SELECT tenant_id INTO branch_tenant FROM public.branches WHERE id = p_branch_id;
  IF product_tenant IS NULL OR product_tenant != caller_tenant OR branch_tenant IS NULL OR branch_tenant != caller_tenant THEN
    RAISE EXCEPTION 'Product or branch not found in your business';
  END IF;

  INSERT INTO public.product_branches (product_id, branch_id) VALUES (p_product_id, p_branch_id)
  ON CONFLICT DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.assign_product_branch(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_product_branch(p_product_id UUID, p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager') THEN
    RAISE EXCEPTION 'Only the business owner or a shop manager can modify branch assignments';
  END IF;

  DELETE FROM public.product_branches
  WHERE product_id = p_product_id AND branch_id = p_branch_id
    AND product_id IN (SELECT id FROM public.products WHERE tenant_id = caller_tenant);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unassign_product_branch(UUID, UUID) TO authenticated;
