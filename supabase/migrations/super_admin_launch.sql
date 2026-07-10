-- ============================================================
-- SUPER ADMIN LAUNCH HARDENING
-- Run this ONCE in Supabase Dashboard > SQL Editor.
-- Idempotent: safe to re-run.
--
-- Fixes:
--  1. Super Admin / platform staff (app_users) get FULL read +
--     write access to tenants and users — this is what was
--     blocking tenant approval from the Super Admin portal.
--  2. Ensures the expanded plan tiers + feature columns exist
--     (approval fails with a CHECK violation without this).
--  3. announcements table — broadcast messages to all tenants.
--  4. support_tickets table — real ticketing (replaces mock).
--  5. audit_logs table — records approvals & platform actions.
--  6. app_users may delete admin_notifications (dismiss).
-- ============================================================

-- ─── 0. Helper functions (SECURITY DEFINER avoids RLS recursion) ───

CREATE OR REPLACE FUNCTION public.is_active_app_user()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
  );
$$;

-- ─── 1. Plan tiers + feature columns (required for approval) ───

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_plan_type_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_plan_type_check
  CHECK (plan_type IN ('byod_monthly', 'standard_plan', 'pro_package', 'business', 'enterprise'));

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS features                 JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS whitelabel               JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS backup_config            JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dedicated_technician_id  UUID REFERENCES public.app_users(id);

-- ─── 2. Platform staff visibility: tenants ───
-- Without SELECT, the Super Admin portal cannot even list pending
-- tenants, so nothing can be approved. Grant full control.

DROP POLICY IF EXISTS "app_users_select_tenants" ON public.tenants;
CREATE POLICY "app_users_select_tenants"
  ON public.tenants FOR SELECT
  USING (public.is_active_app_user());

DROP POLICY IF EXISTS "app_users_approve_tenants" ON public.tenants;
CREATE POLICY "app_users_approve_tenants"
  ON public.tenants FOR UPDATE
  USING (public.is_active_app_user())
  WITH CHECK (public.is_active_app_user());

DROP POLICY IF EXISTS "super_admin_delete_tenants" ON public.tenants;
CREATE POLICY "super_admin_delete_tenants"
  ON public.tenants FOR DELETE
  USING (public.is_super_admin());

-- ─── 3. Platform staff visibility: tenant users ───
-- Needed for email broadcasts (recipient list) and support context.

DROP POLICY IF EXISTS "app_users_select_users" ON public.users;
CREATE POLICY "app_users_select_users"
  ON public.users FOR SELECT
  USING (public.is_active_app_user());

-- ─── 4. Platform staff can see each other (staff management) ───

DROP POLICY IF EXISTS "app_users_select_app_users" ON public.app_users;
CREATE POLICY "app_users_select_app_users"
  ON public.app_users FOR SELECT
  USING (public.is_active_app_user());

-- ─── 5. Announcements — broadcast to all tenants ───

CREATE TABLE IF NOT EXISTS public.announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  audience     TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'active', 'pending')),
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES public.app_users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_manage_announcements" ON public.announcements;
CREATE POLICY "app_users_manage_announcements"
  ON public.announcements FOR ALL
  USING (public.is_active_app_user())
  WITH CHECK (public.is_active_app_user());

-- Tenant users see published announcements only
DROP POLICY IF EXISTS "tenants_read_announcements" ON public.announcements;
CREATE POLICY "tenants_read_announcements"
  ON public.announcements FOR SELECT
  USING (is_published = true AND auth.uid() IS NOT NULL);

-- ─── 6. Support tickets — real ticketing system ───

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no   BIGINT GENERATED ALWAYS AS IDENTITY,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  subject     TEXT NOT NULL,
  description TEXT,
  priority    TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  status      TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_by  UUID,
  assigned_to UUID REFERENCES public.app_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON public.support_tickets(tenant_id);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_manage_tickets" ON public.support_tickets;
CREATE POLICY "app_users_manage_tickets"
  ON public.support_tickets FOR ALL
  USING (public.is_active_app_user())
  WITH CHECK (public.is_active_app_user());

-- Tenant users can raise tickets for their own tenant and read them
DROP POLICY IF EXISTS "tenant_insert_own_tickets" ON public.support_tickets;
CREATE POLICY "tenant_insert_own_tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "tenant_read_own_tickets" ON public.support_tickets;
CREATE POLICY "tenant_read_own_tickets"
  ON public.support_tickets FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- ─── 7. Audit logs ───

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID,
  actor_email TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   UUID,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_users_insert_audit" ON public.audit_logs;
CREATE POLICY "app_users_insert_audit"
  ON public.audit_logs FOR INSERT
  WITH CHECK (public.is_active_app_user());

DROP POLICY IF EXISTS "app_users_read_audit" ON public.audit_logs;
CREATE POLICY "app_users_read_audit"
  ON public.audit_logs FOR SELECT
  USING (public.is_active_app_user());

-- ─── 8. Platform staff read fiscal configs (ZIMRA compliance view) ───

DROP POLICY IF EXISTS "app_users_select_fiscal" ON public.tenant_fiscal_configs;
CREATE POLICY "app_users_select_fiscal"
  ON public.tenant_fiscal_configs FOR SELECT
  USING (public.is_active_app_user());

-- ─── 9. Allow dismissing admin notifications ───

DROP POLICY IF EXISTS "app_users_delete_notifications" ON public.admin_notifications;
CREATE POLICY "app_users_delete_notifications"
  ON public.admin_notifications FOR DELETE
  USING (public.is_active_app_user());
