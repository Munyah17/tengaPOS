-- documents.converted_from_id/converted_to_id had no ON DELETE behavior
-- (defaults to NO ACTION), so deleting either side of a quotation<->invoice
-- conversion link was blocked outright with a foreign key violation --
-- users had no way to delete test data once a quote had been converted.
-- SET NULL is correct here: the link is informational (which document this
-- one came from/became), not something that should ever block a delete.
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_converted_from_id_fkey;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_converted_from_id_fkey
  FOREIGN KEY (converted_from_id) REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_converted_to_id_fkey;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_converted_to_id_fkey
  FOREIGN KEY (converted_to_id) REFERENCES public.documents(id) ON DELETE SET NULL;
