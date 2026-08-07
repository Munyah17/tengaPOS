-- price was NOT NULL DEFAULT 0, forcing every "not priced yet" product to
-- be indistinguishable from a genuine $0.00 price at the storage layer.
-- stock_qty/cost_price were already nullable -- price was the one
-- column not matching that pattern. Default stays 0 for any INSERT that
-- doesn't specify price at all (a safety net, not the intended path --
-- the app now always sends an explicit value, NULL included).
ALTER TABLE public.products ALTER COLUMN price DROP NOT NULL;
