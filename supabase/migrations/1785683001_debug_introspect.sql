-- Temporary introspection query — output read from `supabase db push`, then
-- this file gets removed (see follow-up commit).
SELECT tgname AS trigger_name, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;
