-- Site assets bucket: public read, Super Admin / Admin upload (announcement
-- popup background images, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-assets', 'site-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_site_assets" ON storage.objects;
CREATE POLICY "public_read_site_assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-assets');

DROP POLICY IF EXISTS "app_user_upload_site_assets" ON storage.objects;
CREATE POLICY "app_user_upload_site_assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'site-assets'
    AND EXISTS (
      SELECT 1 FROM public.app_users
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true
    )
  );

DROP POLICY IF EXISTS "app_user_delete_site_assets" ON storage.objects;
CREATE POLICY "app_user_delete_site_assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'site-assets'
    AND EXISTS (
      SELECT 1 FROM public.app_users
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin') AND is_active = true
    )
  );
