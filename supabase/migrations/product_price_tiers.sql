-- Hardware Mode bulk/trade-quantity pricing: a product can define price
-- breaks by quantity (e.g. buy 10+ meters at a lower per-meter price).
-- Stored as [{ "min_qty": 10, "price": 4.50 }, ...] -- the highest tier
-- whose min_qty the cart quantity meets or exceeds wins. Empty for every
-- existing product until a tenant actually sets tiers, so nothing changes
-- for anyone not using this.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;
