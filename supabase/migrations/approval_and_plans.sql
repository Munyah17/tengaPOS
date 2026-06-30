-- ============================================================
-- Tenant approval workflow + plan tracking
-- Run this in the Supabase SQL editor
-- ============================================================

-- 1. Extend tenants table
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended')),
  ADD COLUMN IF NOT EXISTS plan_type      TEXT
    CHECK (plan_type IN ('byod_monthly', 'combo_6month')),
  ADD COLUMN IF NOT EXISTS plan_start_date  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_renewal_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES public.app_users(id);

-- 2. Admin notifications table
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,   -- 'new_signup' | 'renewal_due' | 'payment_due'
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Only active app_users (admin / super_admin / tech_support) may read
CREATE POLICY "app_users_select_notifications"
  ON public.admin_notifications FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND is_active = true
  ));

-- Only active app_users may mark as read
CREATE POLICY "app_users_update_notifications"
  ON public.admin_notifications FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND is_active = true
  ));

-- Only SECURITY DEFINER functions may insert (triggers)
CREATE POLICY "service_insert_notifications"
  ON public.admin_notifications FOR INSERT
  WITH CHECK (true);

-- 3. Trigger: notify admins when a new tenant registers
CREATE OR REPLACE FUNCTION public.notify_admin_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.admin_notifications (type, title, body, tenant_id)
  VALUES (
    'new_signup',
    'New business pending approval',
    '"' || NEW.name || '" just registered and is awaiting plan assignment and approval.',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_created_notify ON public.tenants;
CREATE TRIGGER on_tenant_created_notify
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.notify_admin_new_tenant();

-- 4. RPC: generate renewal / payment-due notifications (call from admin dashboard)
CREATE OR REPLACE FUNCTION public.create_renewal_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Combo 6-month: warn 30 days before renewal (i.e., at the 5-month mark)
  INSERT INTO public.admin_notifications (type, title, body, tenant_id)
  SELECT
    'renewal_due',
    'Renewal due next month — ' || t.name,
    '"' || t.name || '" (Combo 6-month) renews on ' ||
      to_char(t.next_renewal_date, 'DD Mon YYYY') ||
      '. Follow up to confirm renewal or upgrade.',
    t.id
  FROM public.tenants t
  WHERE
    t.status = 'active'
    AND t.plan_type = 'combo_6month'
    AND t.next_renewal_date IS NOT NULL
    AND t.next_renewal_date BETWEEN NOW() AND (NOW() + INTERVAL '31 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_notifications an
      WHERE an.tenant_id = t.id
        AND an.type = 'renewal_due'
        AND an.created_at > (NOW() - INTERVAL '7 days')
    );

  -- BYOD monthly: warn 7 days before monthly payment
  INSERT INTO public.admin_notifications (type, title, body, tenant_id)
  SELECT
    'payment_due',
    'Monthly payment due — ' || t.name,
    '"' || t.name || '" (BYOD Monthly) payment is due on ' ||
      to_char(t.next_renewal_date, 'DD Mon YYYY') || '.',
    t.id
  FROM public.tenants t
  WHERE
    t.status = 'active'
    AND t.plan_type = 'byod_monthly'
    AND t.next_renewal_date IS NOT NULL
    AND t.next_renewal_date BETWEEN NOW() AND (NOW() + INTERVAL '8 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_notifications an
      WHERE an.tenant_id = t.id
        AND an.type = 'payment_due'
        AND an.created_at > (NOW() - INTERVAL '3 days')
    );
END;
$$;

-- 5. RLS on tenants: allow app_users to update status/plan fields
CREATE POLICY "app_users_approve_tenants"
  ON public.tenants FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND role IN ('super_admin', 'admin') AND is_active = true
  ));
