-- Simple shift scheduling: shop managers plan working hours/rotations for
-- their own branch's staff instead of managing accounts (that stays
-- Vendor-only). Deliberately light — one row per shift, no recurrence
-- engine; a manager repeats a shift by creating another row.
CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id  UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  notes      TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_shifts_tenant_date ON public.staff_shifts(tenant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_user ON public.staff_shifts(user_id);

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

-- Tenant-wide read (so a cashier can eventually see their own upcoming
-- shifts too) — write access is scoped to vendor/shop_manager below.
DROP POLICY IF EXISTS "tenant_read_shifts" ON public.staff_shifts;
CREATE POLICY "tenant_read_shifts"
  ON public.staff_shifts FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

-- PERMISSIVE — a RESTRICTIVE-only policy here would never actually grant
-- write access on its own (Postgres requires at least one permissive
-- policy per command; restrictive policies only narrow, they can't grant).
DROP POLICY IF EXISTS "managers_write_shifts" ON public.staff_shifts;
CREATE POLICY "managers_write_shifts"
  ON public.staff_shifts FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager']))
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager']));

-- Shop managers only schedule staff in branches they're actually assigned
-- to — same branch-scoping rule as products/orders elsewhere in the app.
-- Restrictive, so it narrows the permissive tenant policy above rather
-- than replacing it; Vendors are unaffected since they bypass entirely.
DROP POLICY IF EXISTS "branch_scope_shifts" ON public.staff_shifts;
CREATE POLICY "branch_scope_shifts"
  ON public.staff_shifts
  AS RESTRICTIVE
  FOR ALL
  USING (
    public.get_user_role() = 'vendor'
    OR branch_id IS NULL
    OR branch_id IN (SELECT public.get_user_branch_ids())
  )
  WITH CHECK (
    public.get_user_role() = 'vendor'
    OR branch_id IS NULL
    OR branch_id IN (SELECT public.get_user_branch_ids())
  );
