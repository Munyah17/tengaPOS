-- Platform version tracker + "Publish Update" changelog, visible in the
-- Super Admin / Admin portals. Publishing a version reuses the existing
-- announcements pipeline (same table, same tenant-dashboard delivery,
-- same per-user dismiss rules) instead of building a second notification
-- system — a version row just also creates a linked announcement row.
CREATE TABLE IF NOT EXISTS public.platform_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version        TEXT NOT NULL UNIQUE,          -- e.g. 'v1.4'
  title          TEXT NOT NULL,                 -- e.g. 'Receipts & White-Label Overhaul'
  -- Each entry: {"type": "new" | "fixed" | "improved", "description": "..."}
  changes        JSONB NOT NULL DEFAULT '[]',
  announcement_id UUID REFERENCES public.announcements(id) ON DELETE SET NULL,
  created_by     UUID REFERENCES public.app_users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_manage_versions" ON public.platform_versions;
CREATE POLICY "app_users_manage_versions"
  ON public.platform_versions FOR ALL
  USING (public.is_active_app_user())
  WITH CHECK (public.is_active_app_user());

-- Tenants can read published versions too (powers a future "What's New"
-- view in the client app) — same visibility rule as announcements.
DROP POLICY IF EXISTS "tenants_read_versions" ON public.platform_versions;
CREATE POLICY "tenants_read_versions"
  ON public.platform_versions FOR SELECT
  USING (auth.uid() IS NOT NULL);
