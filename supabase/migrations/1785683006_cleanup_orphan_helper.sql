CREATE OR REPLACE FUNCTION public.debug_orphan_ids()
RETURNS TABLE(id UUID, email TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.email::TEXT
  FROM auth.users a
  WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)
    AND NOT EXISTS (SELECT 1 FROM public.app_users au WHERE au.id = a.id);
$$;
GRANT EXECUTE ON FUNCTION public.debug_orphan_ids() TO service_role;
