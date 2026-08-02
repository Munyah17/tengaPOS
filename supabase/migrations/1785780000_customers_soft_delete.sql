-- Same fix as branches_soft_delete.sql / 1785770000_staff_soft_delete.sql --
-- the new standalone Customers management page needs a real "delete" that
-- makes a customer disappear from the list, without breaking the documents/
-- job_cards/vehicles rows that already reference them by customer_id.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
