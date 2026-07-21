-- Extends the Shop Manager 48h-approval flow to VAT (part of 'general') and
-- ZIMRA Fiscalisation ('fiscalisation', its own area — tenant_fiscal_configs
-- is a separate table). Confirmed scope: receipt config, VAT, fiscalisation,
-- and other account-level config — never POS/checkout activity, which has
-- no approval gate and isn't touched by any of this.
ALTER TABLE public.pending_config_changes DROP CONSTRAINT IF EXISTS pending_config_changes_config_area_check;
ALTER TABLE public.pending_config_changes ADD CONSTRAINT pending_config_changes_config_area_check
  CHECK (config_area IN ('general', 'receipts_config', 'fiscalisation'));

CREATE OR REPLACE FUNCTION public.revert_config_change(p_row public.pending_config_changes)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_row.config_area = 'general' THEN
    UPDATE public.tenants SET
      name = COALESCE(p_row.old_values->>'name', name),
      currency = COALESCE(p_row.old_values->>'currency', currency),
      vat_enabled = COALESCE((p_row.old_values->>'vat_enabled')::BOOLEAN, vat_enabled),
      vat_rate = COALESCE((p_row.old_values->>'vat_rate')::NUMERIC, vat_rate)
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

  ELSIF p_row.config_area = 'fiscalisation' THEN
    UPDATE public.tenant_fiscal_configs SET
      device_id = p_row.old_values->>'device_id',
      activation_key = p_row.old_values->>'activation_key',
      device_serial_no = p_row.old_values->>'device_serial_no',
      device_model_name = p_row.old_values->>'device_model_name',
      device_model_version_no = p_row.old_values->>'device_model_version_no',
      tin = p_row.old_values->>'tin',
      vat_number = p_row.old_values->>'vat_number',
      branch_name = p_row.old_values->>'branch_name',
      branch_address = p_row.old_values->>'branch_address',
      branch_contacts = p_row.old_values->>'branch_contacts',
      is_enabled = COALESCE((p_row.old_values->>'is_enabled')::BOOLEAN, false),
      updated_at = NOW()
    WHERE tenant_id = p_row.tenant_id;
  END IF;
END;
$$;

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
  fiscal_unlocked BOOLEAN;
BEGIN
  SELECT role, tenant_id, branch_id INTO caller_role, caller_tenant, caller_branch FROM public.users WHERE id = auth.uid();
  IF caller_role != 'shop_manager' THEN
    RAISE EXCEPTION 'Only a Shop Manager submission goes through approval — Vendors save directly';
  END IF;
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;

  IF p_config_area = 'general' THEN
    SELECT jsonb_build_object('name', name, 'currency', currency, 'vat_enabled', vat_enabled, 'vat_rate', vat_rate) INTO old_vals
    FROM public.tenants WHERE id = p_tenant_id;

    UPDATE public.tenants SET
      name = COALESCE(p_new_values->>'name', name),
      currency = COALESCE(p_new_values->>'currency', currency),
      vat_enabled = COALESCE((p_new_values->>'vat_enabled')::BOOLEAN, vat_enabled),
      vat_rate = COALESCE((p_new_values->>'vat_rate')::NUMERIC, vat_rate)
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

  ELSIF p_config_area = 'fiscalisation' THEN
    -- The paid add-on itself must already be unlocked (Admin/Super Admin
    -- approved) before anyone — Vendor or Shop Manager — can touch it.
    SELECT COALESCE((features->>'fiscalisation')::BOOLEAN, false) INTO fiscal_unlocked
    FROM public.tenants WHERE id = p_tenant_id;
    IF NOT fiscal_unlocked THEN
      RAISE EXCEPTION 'ZIMRA Fiscalisation is not unlocked for this account yet';
    END IF;

    SELECT to_jsonb(tfc.*) INTO old_vals FROM public.tenant_fiscal_configs tfc WHERE tenant_id = p_tenant_id;
    old_vals := COALESCE(old_vals, '{}'::jsonb);

    INSERT INTO public.tenant_fiscal_configs (
      tenant_id, device_id, activation_key, device_serial_no, device_model_name, device_model_version_no,
      tin, vat_number, branch_name, branch_address, branch_contacts, is_enabled, updated_at
    ) VALUES (
      p_tenant_id, p_new_values->>'device_id', p_new_values->>'activation_key', p_new_values->>'device_serial_no',
      p_new_values->>'device_model_name', p_new_values->>'device_model_version_no', p_new_values->>'tin',
      p_new_values->>'vat_number', p_new_values->>'branch_name', p_new_values->>'branch_address',
      p_new_values->>'branch_contacts', COALESCE((p_new_values->>'is_enabled')::BOOLEAN, false), NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
      device_id = EXCLUDED.device_id,
      activation_key = EXCLUDED.activation_key,
      device_serial_no = EXCLUDED.device_serial_no,
      device_model_name = EXCLUDED.device_model_name,
      device_model_version_no = EXCLUDED.device_model_version_no,
      tin = EXCLUDED.tin,
      vat_number = EXCLUDED.vat_number,
      branch_name = EXCLUDED.branch_name,
      branch_address = EXCLUDED.branch_address,
      branch_contacts = EXCLUDED.branch_contacts,
      is_enabled = EXCLUDED.is_enabled,
      updated_at = NOW();
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
