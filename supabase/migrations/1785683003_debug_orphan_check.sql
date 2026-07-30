CREATE OR REPLACE FUNCTION public.debug_check_user_integrity()
RETURNS TABLE(
  auth_count BIGINT,
  public_users_count BIGINT,
  orphaned_auth_no_public BIGINT,
  orphaned_public_no_auth BIGINT,
  duplicate_emails_in_auth BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COUNT(*) FROM auth.users),
    (SELECT COUNT(*) FROM public.users),
    (SELECT COUNT(*) FROM auth.users a WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.id) AND NOT EXISTS (SELECT 1 FROM public.app_users au WHERE au.id = a.id)),
    (SELECT COUNT(*) FROM public.users u WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)),
    (SELECT COUNT(*) FROM (SELECT email FROM auth.users GROUP BY email HAVING COUNT(*) > 1) d);
$$;
GRANT EXECUTE ON FUNCTION public.debug_check_user_integrity() TO service_role;
