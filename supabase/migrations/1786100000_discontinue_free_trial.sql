-- Free trial discontinued with immediate effect, new signups only --
-- existing tenants already mid-trial are completely unaffected (their
-- trial_ends_at / expire_trials()/notify_trial_reminders() keep running
-- exactly as before, right through to whenever it naturally ends).
-- Checkout.jsx/Register.jsx/Landing.jsx no longer offer starting a new
-- one; this is the server-side backstop so a cached old frontend build
-- or a direct API call can't start one either.
CREATE OR REPLACE FUNCTION public.start_free_trial()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN json_build_object('ok', false, 'error', 'Free trials are no longer available. Please choose a plan.');
END;
$$;
