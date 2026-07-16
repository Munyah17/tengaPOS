-- loadProfile() ran up to 3 sequential round trips on every login and every
-- app boot (app_users check, then users+tenants join, then a separate
-- branches lookup) — each one adds real latency on a slow connection.
-- Collapse it into a single round trip. Uses auth.uid() internally (not a
-- client-supplied id) so a user can only ever fetch their own profile.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT to_jsonb(au.*) || jsonb_build_object('userType', 'app_owner')
  INTO result
  FROM public.app_users au
  WHERE au.id = auth.uid();

  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  SELECT to_jsonb(u.*)
    || jsonb_build_object(
         'tenants', to_jsonb(t.*),
         'branch', to_jsonb(b.*),
         'userType', 'tenant',
         'tenantStatus', COALESCE(t.status, 'pending')
       )
  INTO result
  FROM public.users u
  LEFT JOIN public.tenants t ON t.id = u.tenant_id
  LEFT JOIN public.branches b ON b.tenant_id = u.tenant_id AND b.is_main = true
  WHERE u.id = auth.uid();

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
