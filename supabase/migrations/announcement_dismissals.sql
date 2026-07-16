-- Lets any authenticated viewer (tenant staff or platform staff) permanently
-- dismiss a specific announcement so it stops appearing on their dashboard —
-- future announcements are unaffected and follow the same per-user dismiss rule.
CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, announcement_id)
);

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_dismissals" ON public.announcement_dismissals;
CREATE POLICY "users_manage_own_dismissals"
  ON public.announcement_dismissals FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
