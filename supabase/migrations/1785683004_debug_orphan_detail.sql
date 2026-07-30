CREATE OR REPLACE FUNCTION public.debug_orphan_detail()
RETURNS TABLE(email TEXT, created_at TIMESTAMPTZ, raw_meta JSONB)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.email::TEXT, a.created_at, a.raw_user_meta_data
  FROM auth.users a
  WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id)
    AND NOT EXISTS (SELECT 1 FROM public.app_users au WHERE au.id = a.id)
  ORDER BY a.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.debug_orphan_detail() TO service_role;
