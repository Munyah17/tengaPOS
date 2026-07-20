-- Receipt-config approval flow v2.
--
-- Fixes two production bugs:
--  1. UNIQUE (tenant_id, branch_id) treats NULL branch_ids as distinct, so
--     every vendor save of the tenant-wide default INSERTed a NEW row (the
--     ON CONFLICT never fired) — the official tenant had 4 duplicate rows,
--     and fetchEffectiveReceiptConfig picked one arbitrarily, which is why
--     receipt branding appeared to randomly revert.
--  2. A shop manager's edit overwrote the branch's APPROVED row and flagged
--     it pending, so the branch's receipts fell back to the tenant default
--     until the vendor approved. Now the submission lives in its own
--     pending row and the last-approved config keeps printing meanwhile.
--
-- New shape: up to TWO rows per (tenant, branch) scope — one approved
-- (pending_approval = false, the one receipts use) and one pending draft
-- (pending_approval = true, awaiting vendor action). Approving merges the
-- draft into the approved row and deletes the draft.

-- 1) Dedupe: keep only the most recently updated row per scope.
DELETE FROM public.receipt_configs rc
USING public.receipt_configs newer
WHERE rc.tenant_id = newer.tenant_id
  AND COALESCE(rc.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    = COALESCE(newer.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND rc.id <> newer.id
  AND (rc.updated_at, rc.id) < (newer.updated_at, newer.id);

-- 2) Replace the NULL-blind constraint with a COALESCE-based unique index
--    that also allows one approved + one pending row per scope.
ALTER TABLE public.receipt_configs
  DROP CONSTRAINT IF EXISTS receipt_configs_tenant_id_branch_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS receipt_configs_scope_state_uniq
  ON public.receipt_configs (
    tenant_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    pending_approval
  );

-- 3) Submit: vendors write the approved row directly; shop managers write
--    a pending draft row, leaving the approved row untouched.
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
  v_pending BOOLEAN;
  existing_id UUID;
  result_id UUID;
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
      pending_approval, submitted_by, approved_by, approved_at
    ) VALUES (
      caller_tenant, p_branch_id, p_template_mode, p_store_name, p_store_address, p_store_contacts,
      p_tin, p_vat_number, p_footer_message, p_paper_width_mm, p_printer_connection, COALESCE(p_show_pos_print, true),
      v_pending, auth.uid(),
      CASE WHEN is_vendor THEN auth.uid() ELSE NULL END,
      CASE WHEN is_vendor THEN NOW() ELSE NULL END
    )
    RETURNING id INTO result_id;
  END IF;

  RETURN result_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_receipt_config(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN) TO authenticated;

-- 4) Approve: merge the pending draft into the scope's approved row (or
--    promote the draft when no approved row exists yet), then remove it.
CREATE OR REPLACE FUNCTION public.approve_receipt_config(p_config_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID;
  caller_role TEXT;
  pending_row public.receipt_configs%ROWTYPE;
  approved_id UUID;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role != 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can approve receipt config changes';
  END IF;

  SELECT * INTO pending_row FROM public.receipt_configs
  WHERE id = p_config_id AND tenant_id = caller_tenant AND pending_approval = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending change not found';
  END IF;

  SELECT id INTO approved_id FROM public.receipt_configs
  WHERE tenant_id = caller_tenant
    AND COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(pending_row.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND pending_approval = false
  FOR UPDATE;

  IF approved_id IS NOT NULL THEN
    UPDATE public.receipt_configs SET
      template_mode = pending_row.template_mode,
      store_name = pending_row.store_name,
      store_address = pending_row.store_address,
      store_contacts = pending_row.store_contacts,
      tin = pending_row.tin,
      vat_number = pending_row.vat_number,
      footer_message = pending_row.footer_message,
      paper_width_mm = pending_row.paper_width_mm,
      printer_connection = pending_row.printer_connection,
      show_pos_print = pending_row.show_pos_print,
      submitted_by = pending_row.submitted_by,
      approved_by = auth.uid(),
      approved_at = NOW(),
      updated_at = NOW()
    WHERE id = approved_id;
    DELETE FROM public.receipt_configs WHERE id = p_config_id;
  ELSE
    UPDATE public.receipt_configs
    SET pending_approval = false, approved_by = auth.uid(), approved_at = NOW(), updated_at = NOW()
    WHERE id = p_config_id;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_receipt_config(UUID) TO authenticated;
