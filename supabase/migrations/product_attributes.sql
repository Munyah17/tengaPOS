-- Open-ended product attributes (weight, volume, color, size, etc.) so the
-- Add Product form isn't limited to a fixed set of variant fields — stored
-- as a flat key/value map since which attributes matter varies by product.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
