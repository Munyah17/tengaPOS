CREATE OR REPLACE FUNCTION public.debug_get_function_def(fn_name TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p
  WHERE p.proname = fn_name AND p.pronamespace = 'public'::regnamespace
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.debug_get_function_def(TEXT) TO service_role;
