-- VAT on quotations/invoices was always computed from the tenant-wide
-- vat_enabled flag, with no way to leave VAT off a specific document (e.g.
-- a zero-rated customer, or a workshop quoting an export job). Store the
-- choice per document so it's explicit and survives editing/reprinting,
-- rather than re-deriving it from whatever the tenant's setting happens to
-- be at the time.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS vat_enabled BOOLEAN NOT NULL DEFAULT true;
