-- Product images bucket: public read, tenant users upload into their own folder
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public_read_product_images" ON storage.objects;
CREATE POLICY "public_read_product_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "tenant_upload_product_images" ON storage.objects;
CREATE POLICY "tenant_upload_product_images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "tenant_delete_product_images" ON storage.objects;
CREATE POLICY "tenant_delete_product_images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );
