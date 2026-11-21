-- Pre-launch security audit fixes (Nov 2026).
--
-- Root pattern fixed here: several tables/functions were written on the
-- assumption that a permissive "service_*" RLS policy or a SECURITY
-- DEFINER function with no GRANT statement was only reachable by the
-- service role. Neither is true -- service_role BYPASSES RLS entirely
-- (permissive policies named "service_*" actually open the table to
-- EVERY authenticated user), and Postgres grants EXECUTE to PUBLIC on
-- new functions by default. This migration closes each of those holes.

-- ─── 1. payment_sessions: was INSERT/UPDATE ... (true) ─────────────────────
-- Any signed-in user could flip ANY tenant's Paynow session to 'paid'
-- (which also fires trg_settle_desktop_purchase) or to 'cancelled',
-- or insert fake sessions against another tenant.
DROP POLICY IF EXISTS "service_insert_sessions" ON public.payment_sessions;
DROP POLICY IF EXISTS "service_update_sessions" ON public.payment_sessions;

DROP POLICY IF EXISTS "tenant_insert_own_sessions" ON public.payment_sessions;
CREATE POLICY "tenant_insert_own_sessions"
  ON public.payment_sessions FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "tenant_update_own_sessions" ON public.payment_sessions;
CREATE POLICY "tenant_update_own_sessions"
  ON public.payment_sessions FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (tenant_id = public.get_user_tenant_id());

-- ─── 2. tenant_fiscal_configs: drop the open "service_*" policies ─────────
-- The tenant-scoped read/write policies (tenant_read_own_fiscal,
-- tenant_write_own_fiscal, tenant_update_own_fiscal) already exist; these
-- two USING(true) ones additionally let any signed-in user READ every
-- tenant's ZIMRA device config (TIN, VAT number, activation state) and
-- UPDATE it (fiscal counters, device id). Edge functions are unaffected:
-- service_role bypasses RLS.
DROP POLICY IF EXISTS "service_read_fiscal" ON public.tenant_fiscal_configs;
DROP POLICY IF EXISTS "service_update_fiscal" ON public.tenant_fiscal_configs;

-- ─── 3. admin_notifications: drop the open INSERT policy ──────────────────
-- Rows are only ever written by SECURITY DEFINER triggers; the
-- WITH CHECK(true) policy let any signed-in user inject admin-facing
-- notifications at will.
DROP POLICY IF EXISTS "service_insert_notifications" ON public.admin_notifications;

-- ─── 4. job_card_counters: table had NO RLS at all ─────────────────────────
-- Any authenticated user could read/increment/reset another tenant's
-- job-card sequence. Only next_job_card_no() (SECURITY DEFINER) should
-- ever write it.
ALTER TABLE public.job_card_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_own_counter" ON public.job_card_counters;
CREATE POLICY "tenant_read_own_counter"
  ON public.job_card_counters FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

-- ─── 5. next_job_card_no(): PUBLIC-executable with no tenant check ─────────
-- A crafted RPC call could burn through another tenant's job-card numbers.
-- The trigger that calls it runs as the function owner, so revoking
-- EXECUTE here doesn't affect normal inserts.
REVOKE EXECUTE ON FUNCTION public.next_job_card_no(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_job_card_no(UUID) TO service_role;

-- ─── 6. revert_config_change(row): PUBLIC-executable crafted-row write ─────
-- Takes a whole pending_config_changes row as an argument and applies
-- old_values to the named tenant with NO caller check -- any user could
-- overwrite any tenant's name/currency/receipt config (incl. TIN/VAT).
-- Legit callers are reject_config_change() and
-- expire_pending_config_changes(), which run as the function owner and
-- don't need the grant.
REVOKE EXECUTE ON FUNCTION public.revert_config_change(public.pending_config_changes) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revert_config_change(public.pending_config_changes) TO service_role;

-- ─── 7. Cron/service functions: revoke public EXECUTE ─────────────────────
-- These run via pg_cron (postgres role) or as triggers -- never meant to
-- be invoked by a user session. Several send email/WhatsApp for EVERY
-- tenant, lock add-ons, or settle license purchases; leaving them
-- PUBLIC-executable lets any signed-in user fire them on demand.
REVOKE EXECUTE ON FUNCTION public.expire_trials()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_pending_config_changes()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_expired_accounting_erp()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_expired_whatsapp_receipts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_trial_reminders()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_medication_refills()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_new_signup_email()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_desktop_purchase()        FROM PUBLIC, anon, authenticated;

-- Revoking PUBLIC strips every non-owner role, so hand EXECUTE back to
-- service_role explicitly for any future server-side rpc() call paths.
GRANT EXECUTE ON FUNCTION public.expire_trials()                    TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_pending_config_changes()  TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_expired_accounting_erp()    TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_expired_whatsapp_receipts() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_trial_reminders()         TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_medication_refills()      TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_new_signup_email()        TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_desktop_purchase()        TO service_role;

-- ─── 8. settle_desktop_purchase(): only settle a FULLY PAID session ────────
-- It flipped a $150 desktop license to 'paid' the moment the linked
-- payment_session went 'paid' -- without checking the session amount.
-- paynow-initiate trusted the client-supplied amount (fixed separately),
-- so a tampered client could have bought a license for $0.01. The trigger
-- now only settles when the paid session covers the purchase price.
CREATE OR REPLACE FUNCTION public.settle_desktop_purchase()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    UPDATE public.desktop_license_purchases
    SET status = 'paid', paid_at = NOW()
    WHERE payment_ref = NEW.reference
      AND status = 'pending'
      AND NEW.amount >= amount;
  END IF;
  RETURN NEW;
END;
$$;
