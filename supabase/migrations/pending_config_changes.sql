-- Shop Manager config-change approval: a Shop Manager's edit to General
-- settings or Receipts Config now applies immediately (so branch operations
-- aren't blocked waiting on head office) but is tracked here so the Vendor
-- can review it, and it auto-reverts if not approved within 48 hours.
CREATE TABLE IF NOT EXISTS public.pending_config_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  changed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  config_area TEXT NOT NULL CHECK (config_area IN ('general', 'receipts_config')),
  receipt_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  old_values JSONB NOT NULL,
  new_values JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS pending_config_changes_tenant_status_idx ON public.pending_config_changes (tenant_id, status);
CREATE INDEX IF NOT EXISTS pending_config_changes_changed_by_idx ON public.pending_config_changes (changed_by, status);

ALTER TABLE public.pending_config_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_config_changes_tenant ON public.pending_config_changes;
CREATE POLICY pending_config_changes_tenant ON public.pending_config_changes
  FOR ALL
  USING (tenant_id = get_user_tenant_id())
  WITH CHECK (tenant_id = get_user_tenant_id());

-- Applies a snapshot of values back onto the live table for a given
-- config_area/scope. Shared by reject and the 48h auto-expiry.
CREATE OR REPLACE FUNCTION public.revert_config_change(p_row public.pending_config_changes)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_row.config_area = 'general' THEN
    UPDATE public.tenants SET
      name = COALESCE(p_row.old_values->>'name', name),
      currency = COALESCE(p_row.old_values->>'currency', currency)
    WHERE id = p_row.tenant_id;
  ELSIF p_row.config_area = 'receipts_config' THEN
    UPDATE public.receipt_configs SET
      template_mode = p_row.old_values->>'template_mode',
      store_name = p_row.old_values->>'store_name',
      store_address = p_row.old_values->>'store_address',
      store_contacts = p_row.old_values->>'store_contacts',
      tin = p_row.old_values->>'tin',
      vat_number = p_row.old_values->>'vat_number',
      footer_message = p_row.old_values->>'footer_message',
      paper_width_mm = COALESCE((p_row.old_values->>'paper_width_mm')::INTEGER, 80),
      printer_connection = COALESCE(p_row.old_values->>'printer_connection', 'usb'),
      show_pos_print = COALESCE((p_row.old_values->>'show_pos_print')::BOOLEAN, true),
      header_message = p_row.old_values->>'header_message',
      custom_lines = COALESCE(p_row.old_values->'custom_lines', '[]'::jsonb),
      updated_at = NOW()
    WHERE tenant_id = p_row.tenant_id
      AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_row.receipt_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND pending_approval = false;
  END IF;
END;
$$;

-- Shop-Manager-only: apply new_values immediately, snapshot old_values, and
-- track it for Vendor review. Vendors don't call this — their own saves
-- write directly (general settings: plain update; receipts: submit_receipt_config).
CREATE OR REPLACE FUNCTION public.submit_config_change(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_config_area TEXT,
  p_receipt_branch_id UUID,
  p_new_values JSONB
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  caller_branch UUID;
  old_vals JSONB;
  new_id UUID;
  existing RECORD;
BEGIN
  SELECT role, tenant_id, branch_id INTO caller_role, caller_tenant, caller_branch FROM public.users WHERE id = auth.uid();
  IF caller_role != 'shop_manager' THEN
    RAISE EXCEPTION 'Only a Shop Manager submission goes through approval — Vendors save directly';
  END IF;
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  IF p_config_area = 'general' THEN
    SELECT jsonb_build_object('name', name, 'currency', currency) INTO old_vals
    FROM public.tenants WHERE id = p_tenant_id;

    UPDATE public.tenants SET
      name = COALESCE(p_new_values->>'name', name),
      currency = COALESCE(p_new_values->>'currency', currency)
    WHERE id = p_tenant_id;

  ELSIF p_config_area = 'receipts_config' THEN
    IF p_receipt_branch_id IS NOT NULL AND caller_branch IS DISTINCT FROM p_receipt_branch_id THEN
      RAISE EXCEPTION 'Shop managers can only configure their own branch';
    END IF;

    SELECT id, to_jsonb(rc.*) AS vals INTO existing FROM public.receipt_configs rc
    WHERE tenant_id = p_tenant_id
      AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_receipt_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND pending_approval = false
    FOR UPDATE;

    old_vals := COALESCE(existing.vals, '{}'::jsonb);

    IF existing.id IS NOT NULL THEN
      UPDATE public.receipt_configs SET
        template_mode = p_new_values->>'template_mode',
        store_name = p_new_values->>'store_name',
        store_address = p_new_values->>'store_address',
        store_contacts = p_new_values->>'store_contacts',
        tin = p_new_values->>'tin',
        vat_number = p_new_values->>'vat_number',
        footer_message = p_new_values->>'footer_message',
        paper_width_mm = COALESCE((p_new_values->>'paper_width_mm')::INTEGER, 80),
        printer_connection = COALESCE(p_new_values->>'printer_connection', 'usb'),
        show_pos_print = COALESCE((p_new_values->>'show_pos_print')::BOOLEAN, true),
        header_message = p_new_values->>'header_message',
        custom_lines = COALESCE(p_new_values->'custom_lines', '[]'::jsonb),
        submitted_by = auth.uid(),
        updated_at = NOW()
      WHERE id = existing.id;
    ELSE
      INSERT INTO public.receipt_configs (
        tenant_id, branch_id, template_mode, store_name, store_address, store_contacts,
        tin, vat_number, footer_message, paper_width_mm, printer_connection, show_pos_print,
        header_message, custom_lines, pending_approval, submitted_by
      ) VALUES (
        p_tenant_id, p_receipt_branch_id, p_new_values->>'template_mode', p_new_values->>'store_name',
        p_new_values->>'store_address', p_new_values->>'store_contacts', p_new_values->>'tin',
        p_new_values->>'vat_number', p_new_values->>'footer_message',
        COALESCE((p_new_values->>'paper_width_mm')::INTEGER, 80), COALESCE(p_new_values->>'printer_connection', 'usb'),
        COALESCE((p_new_values->>'show_pos_print')::BOOLEAN, true), p_new_values->>'header_message',
        COALESCE(p_new_values->'custom_lines', '[]'::jsonb), false, auth.uid()
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown config area %', p_config_area;
  END IF;

  INSERT INTO public.pending_config_changes (
    tenant_id, branch_id, changed_by, config_area, receipt_branch_id, old_values, new_values
  ) VALUES (
    p_tenant_id, caller_branch, auth.uid(), p_config_area, p_receipt_branch_id, old_vals, p_new_values
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_config_change(UUID, UUID, TEXT, UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_config_change(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  target public.pending_config_changes%ROWTYPE;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role != 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can approve';
  END IF;

  SELECT * INTO target FROM public.pending_config_changes
  WHERE id = p_id AND tenant_id = caller_tenant AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending change not found';
  END IF;

  UPDATE public.pending_config_changes
  SET status = 'approved', decided_at = NOW(), decided_by = auth.uid()
  WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_config_change(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_config_change(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  target public.pending_config_changes%ROWTYPE;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role != 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can reject';
  END IF;

  SELECT * INTO target FROM public.pending_config_changes
  WHERE id = p_id AND tenant_id = caller_tenant AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending change not found';
  END IF;

  PERFORM public.revert_config_change(target);

  UPDATE public.pending_config_changes
  SET status = 'rejected', decided_at = NOW(), decided_by = auth.uid()
  WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_config_change(UUID) TO authenticated;

-- Scheduled: reverts anything still pending past its 48h window.
CREATE OR REPLACE FUNCTION public.expire_pending_config_changes()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_ RECORD;
BEGIN
  FOR row_ IN
    SELECT * FROM public.pending_config_changes WHERE status = 'pending' AND expires_at < NOW() FOR UPDATE
  LOOP
    PERFORM public.revert_config_change(row_);
    UPDATE public.pending_config_changes SET status = 'expired', decided_at = NOW() WHERE id = row_.id;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-pending-config-changes') THEN
    PERFORM cron.unschedule('expire-pending-config-changes');
  END IF;
  PERFORM cron.schedule('expire-pending-config-changes', '*/15 * * * *', 'SELECT public.expire_pending_config_changes()');
END $$;
