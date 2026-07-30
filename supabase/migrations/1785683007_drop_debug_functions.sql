-- Cleanup: temporary introspection helpers used to diagnose the orphaned
-- auth.users / signup-trigger bug. Their job is done (see
-- 1785683005_signup_trigger_self_heal.sql for the real fix).
DROP FUNCTION IF EXISTS public.debug_list_auth_triggers();
DROP FUNCTION IF EXISTS public.debug_check_user_integrity();
DROP FUNCTION IF EXISTS public.debug_orphan_detail();
DROP FUNCTION IF EXISTS public.debug_orphan_ids();
