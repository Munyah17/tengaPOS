-- Completes a previously-abandoned feature: receipt_configs.com_port already
-- existed in production (from an incomplete earlier attempt that left a
-- stray duplicate submit_receipt_config overload — see migration
-- 1785424725_drop_duplicate_receipt_config_overload.sql, which removed the
-- half-finished duplicate). This properly re-adds p_com_port to the ONE
-- canonical function version and wires it through.
--
-- Use case: a classic-Bluetooth (SPP) thermal printer — e.g. MPT-11 and
-- most cheap/generic printers — paired via Windows' own Bluetooth settings
-- shows up as a virtual COM port. print-agent/TengaPOS-PrintAgent.ps1
-- already supports sending raw bytes straight to a named COM port
-- (Send-BytesToSerialPort); this column is how the web app tells it which
-- port to use.
-- CREATE OR REPLACE only replaces a function with the EXACT SAME parameter
-- list — adding p_com_port here means Postgres would otherwise treat this as
-- a brand new overload and keep the old 15-param one alongside it, recreating
-- the exact ambiguous-overload bug this migration is meant to avoid. Drop the
-- old signature explicitly first so there is only ever one.
DROP FUNCTION IF EXISTS public.submit_receipt_config(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN, TEXT, JSONB, TEXT, TEXT
);

CREATE FUNCTION public.submit_receipt_config(
  p_branch_id UUID,
  p_template_mode TEXT,
  p_store_name TEXT,
  p_store_address TEXT,
  p_store_contacts TEXT,
  p_tin TEXT,
  p_vat_number TEXT,
  p_footer_message TEXT,
  p_paper_width_mm INTEGER,
  p_printer_connection TEXT,
  p_show_pos_print BOOLEAN DEFAULT true,
  p_header_message TEXT DEFAULT NULL,
  p_custom_lines JSONB DEFAULT '[]'::jsonb,
  p_logo_url TEXT DEFAULT NULL,
  p_bank_details TEXT DEFAULT NULL,
  p_com_port TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  caller_branch UUID;
  target_tenant UUID;
  is_vendor BOOLEAN;
  v_pending BOOLEAN;
  existing_id UUID;
  result_id UUID;
  default_exists BOOLEAN;
BEGIN
  SELECT role, tenant_id, branch_id INTO caller_role, caller_tenant, caller_branch FROM public.users WHERE id = auth.uid();
  is_vendor := caller_role = 'vendor';
  v_pending := NOT is_vendor;

  IF NOT is_vendor AND caller_role != 'shop_manager' THEN
    RAISE EXCEPTION 'Only the business owner or a shop manager can configure receipts';
  END IF;

  IF NOT is_vendor AND (caller_branch IS NULL OR p_branch_id IS DISTINCT FROM caller_branch) THEN
    RAISE EXCEPTION 'Shop managers can only configure their own branch';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT tenant_id INTO target_tenant FROM public.branches WHERE id = p_branch_id;
    IF target_tenant IS NULL OR target_tenant != caller_tenant THEN
      RAISE EXCEPTION 'Branch not found in your business';
    END IF;
  END IF;

  SELECT id INTO existing_id FROM public.receipt_configs
  WHERE tenant_id = caller_tenant
    AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND pending_approval = v_pending
  FOR UPDATE;

  IF existing_id IS NOT NULL THEN
    UPDATE public.receipt_configs SET
      template_mode = p_template_mode,
      store_name = p_store_name,
      store_address = p_store_address,
      store_contacts = p_store_contacts,
      tin = p_tin,
      vat_number = p_vat_number,
      footer_message = p_footer_message,
      paper_width_mm = p_paper_width_mm,
      printer_connection = p_printer_connection,
      show_pos_print = COALESCE(p_show_pos_print, true),
      header_message = p_header_message,
      custom_lines = COALESCE(p_custom_lines, '[]'::jsonb),
      logo_url = p_logo_url,
      bank_details = p_bank_details,
      com_port = p_com_port,
      submitted_by = auth.uid(),
      approved_by = CASE WHEN is_vendor THEN auth.uid() ELSE approved_by END,
      approved_at = CASE WHEN is_vendor THEN NOW() ELSE approved_at END,
      updated_at = NOW()
    WHERE id = existing_id
    RETURNING id INTO result_id;
  ELSE
    INSERT INTO public.receipt_configs (
      tenant_id, branch_id, template_mode, store_name, store_address, store_contacts,
      tin, vat_number, footer_message, paper_width_mm, printer_connection, show_pos_print,
      header_message, custom_lines, logo_url, bank_details, com_port,
      pending_approval, submitted_by, approved_by, approved_at
    ) VALUES (
      caller_tenant, p_branch_id, p_template_mode, p_store_name, p_store_address, p_store_contacts,
      p_tin, p_vat_number, p_footer_message, p_paper_width_mm, p_printer_connection, COALESCE(p_show_pos_print, true),
      p_header_message, COALESCE(p_custom_lines, '[]'::jsonb), p_logo_url, p_bank_details, p_com_port,
      v_pending, auth.uid(),
      CASE WHEN is_vendor THEN auth.uid() ELSE NULL END,
      CASE WHEN is_vendor THEN NOW() ELSE NULL END
    )
    RETURNING id INTO result_id;
  END IF;

  IF is_vendor AND p_branch_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.receipt_configs
      WHERE tenant_id = caller_tenant AND branch_id IS NULL
    ) INTO default_exists;

    IF NOT default_exists THEN
      INSERT INTO public.receipt_configs (
        tenant_id, branch_id, template_mode, store_name, store_address, store_contacts,
        tin, vat_number, footer_message, paper_width_mm, printer_connection, show_pos_print,
        header_message, custom_lines, logo_url, bank_details, com_port,
        pending_approval, submitted_by, approved_by, approved_at
      ) VALUES (
        caller_tenant, NULL, p_template_mode, p_store_name, p_store_address, p_store_contacts,
        p_tin, p_vat_number, p_footer_message, p_paper_width_mm, p_printer_connection, COALESCE(p_show_pos_print, true),
        p_header_message, COALESCE(p_custom_lines, '[]'::jsonb), p_logo_url, p_bank_details, p_com_port,
        false, auth.uid(), auth.uid(), NOW()
      );
    END IF;
  END IF;

  RETURN result_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_receipt_config(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN, TEXT, JSONB, TEXT, TEXT, TEXT
) TO authenticated;
