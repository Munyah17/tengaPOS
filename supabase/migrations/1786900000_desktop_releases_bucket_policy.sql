-- Storage write policy for the private desktop-releases bucket.
-- The bucket itself is created/configured manually (private, no public
-- access). Without these policies the Super Admin "Publish Release" upload
-- fails RLS — reads stay blocked (downloads stream via the edge function).
-- upsert:true in uploadInstaller() needs both INSERT and UPDATE rights.

DROP POLICY IF EXISTS "super_admin_insert_desktop_releases" ON storage.objects;
CREATE POLICY "super_admin_insert_desktop_releases"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'desktop-releases' AND public.is_super_admin());

DROP POLICY IF EXISTS "super_admin_update_desktop_releases" ON storage.objects;
CREATE POLICY "super_admin_update_desktop_releases"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'desktop-releases' AND public.is_super_admin())
WITH CHECK (bucket_id = 'desktop-releases' AND public.is_super_admin());
