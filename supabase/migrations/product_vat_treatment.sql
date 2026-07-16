-- Per-product VAT treatment. A flat "VAT on/off" toggle isn't actually how
-- Zimbabwe's VAT Act works — zero-rated (0%, still VAT-reportable) and
-- exempt (outside VAT entirely) are legally distinct categories, and which
-- goods fall into which changed materially in 2024-2026 (agricultural
-- goods/services and medicines moved from zero-rated to exempt). Defaults
-- to 'standard' so every existing product keeps behaving exactly as before.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vat_treatment TEXT NOT NULL DEFAULT 'standard'
  CHECK (vat_treatment IN ('standard', 'zero_rated', 'exempt'));
