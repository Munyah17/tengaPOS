-- No-Sale drawer-open tracking + SOS/panic alert log -- closes two real,
-- currently wide-open gaps: nothing today records the till being opened
-- outside a completed sale (the classic "making change" cover story for
-- pocketing cash), and there's no way for staff to silently call for help
-- during an active threat.

CREATE TABLE IF NOT EXISTS public.drawer_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  opened_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason        TEXT NOT NULL,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'flagged')),
  reviewed_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drawer_events_tenant ON public.drawer_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawer_events_status ON public.drawer_events(tenant_id, status);

ALTER TABLE public.drawer_events ENABLE ROW LEVEL SECURITY;

-- Manager+ see every event tenant-wide (oversight); everyone else only
-- sees their own -- Postgres ORs permissive policies together, same
-- pattern as Cash-Up (1786130000_cash_up.sql).
DROP POLICY IF EXISTS "drawer_events_manager_read" ON public.drawer_events;
CREATE POLICY "drawer_events_manager_read"
  ON public.drawer_events FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

DROP POLICY IF EXISTS "drawer_events_own_read" ON public.drawer_events;
CREATE POLICY "drawer_events_own_read"
  ON public.drawer_events FOR SELECT
  USING (opened_by = auth.uid());

-- RPC-only writes, matching voids/returns/discount_authorizations -- no
-- direct INSERT/UPDATE policy exists at all.
CREATE OR REPLACE FUNCTION public.log_drawer_open(
  p_tenant_id UUID, p_branch_id UUID, p_reason TEXT, p_note TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; v_id UUID;
BEGIN
  SELECT tenant_id INTO caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to open the drawer';
  END IF;

  INSERT INTO public.drawer_events (tenant_id, branch_id, opened_by, reason, note)
  VALUES (p_tenant_id, p_branch_id, auth.uid(), p_reason, NULLIF(p_note, ''))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.log_drawer_open(UUID, UUID, TEXT, TEXT) TO authenticated;

-- Manager sign-off, after the fact -- opening the drawer itself is never
-- blocked on this (a cashier can't queue behind a manager mid-shift just
-- to make change), but every open is logged with a reason and queued for
-- review, and the cashier knows it will be. 'flag' is the equivalent of a
-- rejection: the drawer already opened, there's nothing to undo, so this
-- is how a manager marks one for follow-up outside the system (a
-- conversation, a write-up) rather than silently letting it slide.
CREATE OR REPLACE FUNCTION public.review_drawer_event(
  p_event_id UUID, p_action TEXT, p_note TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; ev RECORD;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to review drawer events';
  END IF;
  IF p_action NOT IN ('approve', 'flag') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  SELECT * INTO ev FROM public.drawer_events WHERE id = p_event_id AND tenant_id = caller_tenant FOR UPDATE;
  IF ev.id IS NULL THEN RAISE EXCEPTION 'Drawer event not found'; END IF;

  UPDATE public.drawer_events
  SET status = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'flagged' END,
      reviewed_by = auth.uid(), reviewed_at = NOW(), review_note = NULLIF(p_note, '')
  WHERE id = p_event_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.review_drawer_event(UUID, TEXT, TEXT) TO authenticated;

-- ─── SOS / panic alerts ─────────────────────────────────────────────────
-- No direct INSERT policy -- only the sos-alert edge function (service
-- role) writes this table, since triggering an alert also means reaching
-- SMTP/WhatsApp secrets that only ever live server-side, and doing the
-- insert + notification fan-out as one atomic step there is simpler and
-- safer than a client RPC insert plus a second call to send it. Read is
-- manager+ only -- this is an oversight log, not something a cashier
-- browses (and the whole point of a duress alert is it stays out of a
-- potential accomplice's view).
CREATE TABLE IF NOT EXISTS public.sos_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  triggered_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  resolved_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_tenant ON public.sos_alerts(tenant_id, created_at DESC);

ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sos_alerts_manager_read" ON public.sos_alerts;
CREATE POLICY "sos_alerts_manager_read"
  ON public.sos_alerts FOR SELECT
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE OR REPLACE FUNCTION public.resolve_sos_alert(
  p_alert_id UUID, p_note TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Not authorized to resolve SOS alerts';
  END IF;

  UPDATE public.sos_alerts
  SET resolved = true, resolved_by = auth.uid(), resolved_at = NOW(), resolved_note = NULLIF(p_note, '')
  WHERE id = p_alert_id AND tenant_id = caller_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOS alert not found'; END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_sos_alert(UUID, TEXT) TO authenticated;
