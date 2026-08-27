-- Batch/expiry/storage-location detail for stock -- free-text/simple types,
-- no new storage-location hierarchy table (a pharmacy this size manages
-- locations as a label like "Shelf A3" or "Cold Storage", not a structured
-- warehouse graph). Generic on products (not gated to pharmacy tenants at
-- the DB layer), matching dispensing_class/controlled_schedule's approach.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS batch_no TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS storage_location TEXT;
