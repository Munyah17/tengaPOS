-- Phase 2A of Workshop Mode, closing gaps against the client's FSD:
--  1. Technicians are master data only -- they never log in, unlike every
--     other role in this app. job_cards.assigned_to previously pointed at
--     users(id); swapping it to a dedicated technicians table (no rows
--     assigned yet in production, confirmed before writing this).
--  2. Job cards gain a diagnosis note and a parts-requested checklist
--     (separate from the billable `items`, which stay the finalized
--     parts/labor once diagnosis is done) -- lets a service advisor run
--     the whole "customer in -> diagnose -> request parts -> bill" flow
--     from one screen, per the FSD's stated workflow.
--  3. Job cards can now trace back to the quotation they came from.

CREATE TABLE IF NOT EXISTS public.technicians (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT,
  specialty  TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_technicians_tenant ON public.technicians(tenant_id, is_active);

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "technicians_tenant_access" ON public.technicians;
CREATE POLICY "technicians_tenant_access"
  ON public.technicians FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']));

ALTER TABLE public.job_cards
  ADD COLUMN IF NOT EXISTS diagnosis TEXT,
  ADD COLUMN IF NOT EXISTS parts_requested JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

ALTER TABLE public.job_cards DROP CONSTRAINT IF EXISTS job_cards_assigned_to_fkey;
ALTER TABLE public.job_cards
  ADD CONSTRAINT job_cards_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.technicians(id) ON DELETE SET NULL;
