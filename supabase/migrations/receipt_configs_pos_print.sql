-- Optional "POS Printer" button on the receipt modal — per tenant/branch.
-- Some vendors only ever use the browser Print (A4/PDF) flow and the extra
-- button confuses cashiers; disabling it here hides it from the modal.
ALTER TABLE public.receipt_configs
  ADD COLUMN IF NOT EXISTS show_pos_print BOOLEAN NOT NULL DEFAULT true;

-- Recreate the submit RPC with the new field. The old 10-arg signature is
-- dropped first (CREATE OR REPLACE with a different arg list would create an
-- ambiguous overload instead). p_show_pos_print has a DEFAULT so frontends
-- deployed before this migration keep working unchanged.
DROP FUNCTION IF EXISTS public.submit_receipt_config(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT);

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
  p_show_pos_print BOOLEAN DEFAULT true
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role TEXT;
  caller_tenant UUID;
  caller_branch UUID;
  target_tenant UUID;
  is_vendor BOOLEAN;
  result_id UUID;
BEGIN
  SELECT role, tenant_id, branch_id INTO caller_role, caller_tenant, caller_branch FROM public.users WHERE id = auth.uid();
  is_vendor := caller_role = 'vendor';

  IF NOT is_vendor AND caller_role != 'shop_manager' THEN
    RAISE EXCEPTION 'Only the business owner or a shop manager can configure receipts';
  END IF;

  -- Shop managers may only ever touch their own branch's row — including
  -- rejecting an attempt to set the tenant-wide default (p_branch_id NULL),
  -- which is not "their branch" and must stay Vendor-only. A shop manager
  -- with no assigned branch (misconfigured account) can't touch this at all.
  IF NOT is_vendor AND (caller_branch IS NULL OR p_branch_id IS DISTINCT FROM caller_branch) THEN
    RAISE EXCEPTION 'Shop managers can only configure their own branch';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    SELECT tenant_id INTO target_tenant FROM public.branches WHERE id = p_branch_id;
    IF target_tenant IS NULL OR target_tenant != caller_tenant THEN
      RAISE EXCEPTION 'Branch not found in your business';
    END IF;
  END IF;

  INSERT INTO public.receipt_configs (
    tenant_id, branch_id, template_mode, store_name, store_address, store_contacts,
    tin, vat_number, footer_message, paper_width_mm, printer_connection, show_pos_print,
    pending_approval, submitted_by, approved_by, approved_at
  ) VALUES (
    caller_tenant, p_branch_id, p_template_mode, p_store_name, p_store_address, p_store_contacts,
    p_tin, p_vat_number, p_footer_message, p_paper_width_mm, p_printer_connection, COALESCE(p_show_pos_print, true),
    NOT is_vendor, auth.uid(), CASE WHEN is_vendor THEN auth.uid() ELSE NULL END, CASE WHEN is_vendor THEN NOW() ELSE NULL END
  )
  ON CONFLICT (tenant_id, branch_id) DO UPDATE SET
    template_mode = EXCLUDED.template_mode,
    store_name = EXCLUDED.store_name,
    store_address = EXCLUDED.store_address,
    store_contacts = EXCLUDED.store_contacts,
    tin = EXCLUDED.tin,
    vat_number = EXCLUDED.vat_number,
    footer_message = EXCLUDED.footer_message,
    paper_width_mm = EXCLUDED.paper_width_mm,
    printer_connection = EXCLUDED.printer_connection,
    show_pos_print = EXCLUDED.show_pos_print,
    pending_approval = NOT is_vendor,
    submitted_by = auth.uid(),
    approved_by = CASE WHEN is_vendor THEN auth.uid() ELSE public.receipt_configs.approved_by END,
    approved_at = CASE WHEN is_vendor THEN NOW() ELSE public.receipt_configs.approved_at END,
    updated_at = NOW()
  RETURNING id INTO result_id;

  RETURN result_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_receipt_config(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO authenticated;
