-- Standard/Pro Package pricing change: the hardware (tablet + printer) is
-- still a once-off payment, unchanged -- but Standard/Pro tenants now also
-- need an ongoing hosting subscription ($20/mo or $200/yr Standard, $35/mo
-- or $300/yr Pro), same "own checkout type, own expiry, gated by Settings"
-- shape as accounting_erp/ai_insights/whatsapp_receipts. New signups only
-- (confirmed explicitly) -- existing Standard/Pro tenants keep the
-- "no subscriptions" deal they actually bought; enforcement in
-- App.jsx only ever applies to a tenant whose plan_start_date is on or
-- after this pricing change, never retroactively.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS hosting_expires_at TIMESTAMPTZ;
