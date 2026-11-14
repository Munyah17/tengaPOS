-- set_user_home_branch: change which branch a staff member belongs to.
--
-- users.branch_id is a staff member's HOME branch -- their default active
-- branch at login and one half of get_user_branch_ids(). Until now the
-- only ways to set it were account creation (tenant-add-staff /
-- manage-user) and direct DB access, so the Vendor had no in-app way to
-- move someone between branches. This RPC is that control: Vendor-only
-- (matching assign_user_branch et al. in 1787100000), tenant-scoped, and
-- it cleans up a now-redundant user_branches grant when the new home
-- branch was previously only an "extra" access grant.
CREATE OR REPLACE FUNCTION public.set_user_home_branch(p_user_id UUID, p_branch_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  target_tenant UUID;
  target_role TEXT;
  branch_tenant UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role <> 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can change a staff member''s branch';
  END IF;

  SELECT tenant_id, role INTO target_tenant, target_role FROM public.users WHERE id = p_user_id;
  IF target_tenant IS NULL OR target_tenant != caller_tenant THEN
    RAISE EXCEPTION 'User not found in your business';
  END IF;
  -- The vendor account itself is never branch-bound.
  IF target_role = 'vendor' THEN
    RAISE EXCEPTION 'The owner account does not belong to a branch';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT tenant_id INTO branch_tenant FROM public.branches WHERE id = p_branch_id;
    IF branch_tenant IS NULL OR branch_tenant != caller_tenant THEN
      RAISE EXCEPTION 'Branch not found in your business';
    END IF;
    -- If this branch was previously granted as "extra" access, the grant
    -- is now redundant -- the home branch already covers it.
    DELETE FROM public.user_branches WHERE user_id = p_user_id AND branch_id = p_branch_id;
  END IF;

  UPDATE public.users SET branch_id = p_branch_id WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_user_home_branch(UUID, UUID) TO authenticated;
