CREATE OR REPLACE FUNCTION public.debug_list_auth_triggers()
RETURNS TABLE(trigger_name TEXT, event_manipulation TEXT, action_statement TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT trigger_name::TEXT, event_manipulation::TEXT, action_statement::TEXT
  FROM information_schema.triggers
  WHERE event_object_schema = 'auth' AND event_object_table = 'users';
$$;
GRANT EXECUTE ON FUNCTION public.debug_list_auth_triggers() TO service_role, authenticated;
