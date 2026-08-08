-- Reported live: products genuinely priced in fractions of a cent per unit
-- ("$1 for 8" = $0.1250 each) were silently rounded to $0.13 on save
-- because these columns were NUMERIC(12,2) -- Postgres rounds to the
-- declared scale on write, regardless of what the app sends. Widening the
-- scale to 4 lets the exact per-unit price be stored; money actually
-- charged to a customer (order_items.total, orders.subtotal/tax_amount/
-- total, transactions.amount) is untouched and still rounds to cents,
-- since that's real currency, not a per-unit price.
ALTER TABLE public.products ALTER COLUMN price TYPE NUMERIC(12, 4);
ALTER TABLE public.products ALTER COLUMN cost_price TYPE NUMERIC(12, 4);
ALTER TABLE public.order_items ALTER COLUMN unit_price TYPE NUMERIC(12, 4);
