-- The Salesperson capture on checkout (staff dropdown + manual entry) is
-- wanted by some tenants but not others -- it currently always shows for
-- everyone. Gate the whole thing behind a per-tenant, Vendor-only switch:
-- off by default so it doesn't newly clutter checkout for tenants who
-- never asked for it, and when off the "+ Add Salesperson" section must
-- not render at all (enforced client-side in POS.jsx).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS salesperson_capture_enabled BOOLEAN NOT NULL DEFAULT false;
