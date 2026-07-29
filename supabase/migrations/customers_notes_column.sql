-- createCustomer() has always unconditionally sent notes: notes || null on
-- every insert, but this column never existed on customers -- so every
-- single new-customer creation (Job Cards' "+ New customer", Invoicing's
-- findOrCreateCustomer) was failing with "Could not find the 'notes'
-- column of 'customers' in the schema cache", for every role, not just the
-- shop_assistant RLS gap fixed separately in workshop_shop_assistant_access.sql.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes TEXT;
