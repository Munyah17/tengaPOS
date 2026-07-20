-- Fully-custom receipts: a header line (separate from the existing footer)
-- plus a free-form list of extra lines (QR/website/social/return-policy/
-- anything else) the tenant can add without waiting on a new column per idea.
ALTER TABLE public.receipt_configs ADD COLUMN IF NOT EXISTS header_message TEXT;
ALTER TABLE public.receipt_configs ADD COLUMN IF NOT EXISTS custom_lines JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.submit_receipt_config(
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
  p_custom_lines JSONB DEFAULT '[]'::jsonb
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
      header_message, custom_lines,
      pending_approval, submitted_by, approved_by, approved_at
    ) VALUES (
      caller_tenant, p_branch_id, p_template_mode, p_store_name, p_store_address, p_store_contacts,
      p_tin, p_vat_number, p_footer_message, p_paper_width_mm, p_printer_connection, COALESCE(p_show_pos_print, true),
      p_header_message, COALESCE(p_custom_lines, '[]'::jsonb),
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
        header_message, custom_lines,
        pending_approval, submitted_by, approved_by, approved_at
      ) VALUES (
        caller_tenant, NULL, p_template_mode, p_store_name, p_store_address, p_store_contacts,
        p_tin, p_vat_number, p_footer_message, p_paper_width_mm, p_printer_connection, COALESCE(p_show_pos_print, true),
        p_header_message, COALESCE(p_custom_lines, '[]'::jsonb),
        false, auth.uid(), auth.uid(), NOW()
      );
    END IF;
  END IF;

  RETURN result_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_receipt_config(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN, TEXT, JSONB) TO authenticated;

-- Drop the old 11-arg overload now that the client always calls the 13-arg
-- version (PostgREST would otherwise see two candidates for the same name
-- and refuse to pick one on the old positional call).
DROP FUNCTION IF EXISTS public.submit_receipt_config(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN);
