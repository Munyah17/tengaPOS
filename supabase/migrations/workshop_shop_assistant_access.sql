-- shop_assistant is one of the five tenant staff roles (see TENANT_ROLES in
-- tenant-add-staff/manage-user), but the workshop tables' RLS policies only
-- ever listed vendor/shop_manager/supervisor/cashier -- shop_assistant was
-- never added when these policies were written, so any staff member created
-- with that role is silently blocked from job cards, vehicles, and
-- technicians (UI renders fine, every insert/select just fails RLS).
-- products and documents intentionally still exclude shop_assistant/cashier
-- -- inventory edits and financial documents stay manager+ -- this only
-- covers the front-counter workshop tables.

DROP POLICY IF EXISTS "job_cards_tenant_access" ON public.job_cards;
CREATE POLICY "job_cards_tenant_access"
  ON public.job_cards
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));

DROP POLICY IF EXISTS "vehicles_tenant_access" ON public.vehicles;
CREATE POLICY "vehicles_tenant_access"
  ON public.vehicles
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));

DROP POLICY IF EXISTS "technicians_tenant_access" ON public.technicians;
CREATE POLICY "technicians_tenant_access"
  ON public.technicians
  FOR ALL
  USING (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']))
  WITH CHECK (tenant_id = get_user_tenant_id() AND get_user_role() = ANY (ARRAY['vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant']));
