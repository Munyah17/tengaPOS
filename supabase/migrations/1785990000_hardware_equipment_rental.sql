-- Hardware Mode: equipment/tool rental register. Hardware stores commonly
-- also rent out equipment (drills, mixers, scaffolding) alongside selling
-- stock -- a genuinely distinct workflow from a normal sale (checkout with
-- a deposit, a due-back date, and a return step that may include a late
-- fee or partial deposit refund), not covered by anything else in the app.
CREATE TABLE IF NOT EXISTS public.equipment_rentals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id        UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  item_name        TEXT NOT NULL,
  product_id       UUID REFERENCES public.products(id) ON DELETE SET NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  daily_rate       NUMERIC(12,2) DEFAULT 0,
  deposit_amount   NUMERIC(12,2) DEFAULT 0,
  deposit_returned BOOLEAN NOT NULL DEFAULT false,
  checked_out_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_back_at      TIMESTAMPTZ NOT NULL,
  returned_at      TIMESTAMPTZ,
  late_fee         NUMERIC(12,2),
  notes            TEXT,
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_equipment_rentals_tenant ON public.equipment_rentals(tenant_id, returned_at, due_back_at);

ALTER TABLE public.equipment_rentals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_rentals_select" ON public.equipment_rentals;
CREATE POLICY "equipment_rentals_select"
  ON public.equipment_rentals FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "equipment_rentals_write" ON public.equipment_rentals;
CREATE POLICY "equipment_rentals_write"
  ON public.equipment_rentals FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier']));
