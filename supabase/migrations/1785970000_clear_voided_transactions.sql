-- "Clear Voided Transactions" -- lets the Vendor tidy voided clutter out of
-- the main Transactions list without destroying the record. Archives
-- (never deletes) the transaction rows for validated voids, and logs who
-- did the clearing to a new tenant-facing activity log (distinct from the
-- platform-only audit_logs table, which tenant-side users can't read at
-- all -- see super_admin_launch.sql's is_active_app_user()-gated policies).
-- Per-void attribution (who requested/approved/validated each void) already
-- lives permanently on the voids row itself and is untouched by this.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.tenant_activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenant_activity_log_tenant ON public.tenant_activity_log(tenant_id, created_at DESC);

ALTER TABLE public.tenant_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_activity_log_read" ON public.tenant_activity_log;
CREATE POLICY "tenant_activity_log_read"
  ON public.tenant_activity_log FOR SELECT
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor']));

CREATE OR REPLACE FUNCTION public.clear_voided_transactions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_count INTEGER;
BEGIN
  IF get_user_role() != 'vendor' THEN
    RAISE EXCEPTION 'Only the Vendor can clear voided transactions';
  END IF;
  v_tenant_id := get_user_tenant_id();

  WITH voided_orders AS (
    SELECT order_id FROM public.voids WHERE tenant_id = v_tenant_id AND status = 'validated'
  ), updated AS (
    UPDATE public.transactions
    SET archived_at = NOW()
    WHERE tenant_id = v_tenant_id
      AND archived_at IS NULL
      AND order_id IN (SELECT order_id FROM voided_orders)
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;

  IF v_count > 0 THEN
    INSERT INTO public.tenant_activity_log (tenant_id, actor_id, action, details)
    VALUES (v_tenant_id, auth.uid(), 'voided_transactions_cleared', jsonb_build_object('count', v_count));
  END IF;

  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.clear_voided_transactions() TO authenticated;
