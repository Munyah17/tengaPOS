-- Accounting & ERP buildout: Requisitions -- internal requests for funds or
-- items. Simple direct status update by vendor/shop_manager (RLS role
-- check), not a separate request/approve RPC chain -- appropriate for this
-- module's stakes versus e.g. void/return requests elsewhere in the app.
CREATE TABLE IF NOT EXISTS public.requisitions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  requested_by      UUID REFERENCES public.users(id),
  purpose           TEXT NOT NULL,
  amount_requested  NUMERIC NOT NULL CHECK (amount_requested > 0),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'fulfilled')),
  approved_by       UUID REFERENCES public.users(id),
  approved_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_requisitions_tenant ON public.requisitions(tenant_id, status, created_at DESC);

ALTER TABLE public.requisitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "requisitions_tenant_access" ON public.requisitions;
CREATE POLICY "requisitions_tenant_access"
  ON public.requisitions FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));
