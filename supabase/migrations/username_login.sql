-- Username OR email login for tenant staff (cashier, shop assistant,
-- supervisor, shop manager, vendor) - either identifier works, neither is
-- required, existing accounts are entirely unaffected since username stays
-- NULL until someone sets one.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Supabase Auth only ever signs in by email — this resolves a typed
-- username back to its account's real email so the client can pass that
-- to signInWithPassword() transparently. Callable by anon (needed before
-- login) but only ever returns an email, never a password or other detail,
-- and gives no signal distinguishing "no such username" from "found."
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_identifier TEXT)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT email FROM public.users
  WHERE username = lower(trim(p_identifier)) AND is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO anon, authenticated;
