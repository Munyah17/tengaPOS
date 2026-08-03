-- The Accounting & ERP Suppliers page (src/lib/db.js fetchSuppliers/etc.)
-- expects deleted_at/updated_at, but public.suppliers already existed from
-- before this app's tracked migrations (with contact_name/is_active
-- instead) -- 1785820000's CREATE TABLE IF NOT EXISTS silently no-op'd
-- against it, so the columns the ERP page relies on were never added.
-- Purely additive: existing columns/rows are untouched.
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
