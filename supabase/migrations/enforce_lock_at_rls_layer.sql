-- Found via simulation: a locked account's still-valid JWT could still read
-- and write data directly through the API — is_locked was only checked by
-- the React app's own login screen, not by RLS. Since nearly every tenant
-- RLS policy in the codebase gates on get_user_tenant_id() matching the
-- row's tenant_id, making that function return NULL for a locked user
-- makes every one of those policies fail to match anything, with a single
-- change instead of touching dozens of policies individually.
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() AND is_locked = false;
$$;
