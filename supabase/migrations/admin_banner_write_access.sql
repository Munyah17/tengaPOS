-- Allow the (non-super) Admin role to enable/disable/edit the site_banner
-- announcement popup from the regular Admin portal, while plan/fiscal
-- pricing keys remain Super Admin-only via the existing
-- "super_admin_write_platform_settings" policy.

DROP POLICY IF EXISTS "admin_write_site_banner" ON public.platform_settings;
CREATE POLICY "admin_write_site_banner"
  ON public.platform_settings FOR ALL
  USING (
    key = 'site_banner' AND EXISTS (
      SELECT 1 FROM public.app_users
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true
    )
  )
  WITH CHECK (
    key = 'site_banner' AND EXISTS (
      SELECT 1 FROM public.app_users
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true
    )
  );
