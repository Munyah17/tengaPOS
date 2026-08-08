-- order_items.product_id was always a plain UUID column with no foreign
-- key to products -- PostgREST's embedding (order_items(*, products(...)))
-- relies entirely on declared FK constraints to resolve a join path, so
-- any query trying to embed products through order_items (added for the
-- Orders page redesign, to show each item's category/specs) fails
-- outright with "could not find a relationship", breaking the whole
-- Orders fetch. ON DELETE SET NULL, not CASCADE/RESTRICT: an order_items
-- row is a permanent historical sales record and must survive its
-- product being discontinued/deleted later.
UPDATE public.order_items oi
SET product_id = NULL
WHERE oi.product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = oi.product_id);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
