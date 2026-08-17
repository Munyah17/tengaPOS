-- Found while investigating "added inventory took time to show up elsewhere":
-- the supabase_realtime publication had NO tables in it at all. Every
-- postgres_changes subscription already written in the app (AppLayout's
-- tenant-status live-refresh, Orders/Kitchen/Dining's live order boards)
-- has been subscribing to channels that could never actually receive an
-- event -- not erroring, just silently doing nothing. This is the real
-- fix, not just for products but for everything already depending on it.
ALTER PUBLICATION supabase_realtime ADD TABLE public.tenants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
