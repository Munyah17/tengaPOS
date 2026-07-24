-- Username uniqueness was global (plain `username TEXT UNIQUE`), so two
-- different tenants could not both have a staff member named "Tendai" --
-- one tenant's "username already taken" was really a different business
-- entirely. Scope uniqueness per tenant instead.
--
-- A bare username is no longer enough on its own to find a unique account
-- (the same username can now legitimately belong to several tenants), so
-- username-based login now requires the account's email alongside it.
-- Email-only login is unaffected (Supabase Auth emails are still globally
-- unique, so that path never needed disambiguation).

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_username_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_username_key
  ON public.users (tenant_id, lower(username))
  WHERE username IS NOT NULL;

DROP FUNCTION IF EXISTS public.resolve_login_email(TEXT);

CREATE OR REPLACE FUNCTION public.resolve_login_email(p_username TEXT, p_email TEXT)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT email FROM public.users
  WHERE username = lower(trim(p_username))
    AND email = lower(trim(p_email))
    AND is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT, TEXT) TO anon, authenticated;
