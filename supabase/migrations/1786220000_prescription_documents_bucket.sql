-- Same tenant-folder-prefix isolation pattern as product-images/business-logos
-- (storage.foldername(name)[1] must equal the caller's tenant_id), but
-- private (not public read) -- a prescription photo is patient data, unlike
-- a product photo, so it needs a scoped SELECT policy instead of public: true.
INSERT INTO storage.buckets (id, name, public)
VALUES ('prescription-documents', 'prescription-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tenant_read_prescription_documents" ON storage.objects;
CREATE POLICY "tenant_read_prescription_documents" ON storage.objects FOR SELECT
  USING (bucket_id = 'prescription-documents'
    AND (storage.foldername(name))[1] IN (SELECT tenant_id::text FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "tenant_upload_prescription_documents" ON storage.objects;
CREATE POLICY "tenant_upload_prescription_documents" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'prescription-documents'
    AND (storage.foldername(name))[1] IN (SELECT tenant_id::text FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "tenant_delete_prescription_documents" ON storage.objects;
CREATE POLICY "tenant_delete_prescription_documents" ON storage.objects FOR DELETE
  USING (bucket_id = 'prescription-documents'
    AND (storage.foldername(name))[1] IN (SELECT tenant_id::text FROM public.users WHERE id = auth.uid()));
