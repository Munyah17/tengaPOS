-- Real, persisted receipt branding/config — replaces the old "Store
-- Details" Settings tab, which was never wired to anything (hardcoded
-- defaultValue inputs with no save handler), so receipts always fell back
-- to demo placeholders no matter what a vendor typed in.
--
-- One row per (tenant_id, branch_id): branch_id NULL is the tenant-wide
-- default; a non-null row overrides it for that specific branch. Vendors
-- can edit both freely. Shop managers can only create/edit their own
-- branch's override, and it stays inactive (pending_approval = true) until
-- a Vendor approves it — receipts keep using the last-approved version
-- (or the tenant default) in the meantime.
CREATE TABLE IF NOT EXISTS public.receipt_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  -- 'zimra_default' = standard ZIMRA-format receipt, no customisation.
  -- 'zimra_customized' = ZIMRA format with your own store info/footer.
  -- 'fully_customized' = your own layout, ZIMRA fiscal section only shown
  -- if fiscalisation is actually active for this tenant.
  template_mode     TEXT NOT NULL DEFAULT 'zimra_default'
                    CHECK (template_mode IN ('zimra_default', 'zimra_customized', 'fully_customized')),
  store_name        TEXT,
  store_address     TEXT,
  store_contacts    TEXT,
  tin               TEXT,
  vat_number        TEXT,
  footer_message    TEXT,
  paper_width_mm    INTEGER NOT NULL DEFAULT 80,
  printer_connection TEXT NOT NULL DEFAULT 'usb'
                    CHECK (printer_connection IN ('usb', 'lpt1', 'network', 'wifi', 'bluetooth', 'serial')),
  pending_approval  BOOLEAN NOT NULL DEFAULT false,
  submitted_by      UUID REFERENCES public.users(id),
  approved_by       UUID REFERENCES public.users(id),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id)
);

ALTER TABLE public.receipt_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_read_receipt_configs" ON public.receipt_configs;
CREATE POLICY "tenant_read_receipt_configs"
  ON public.receipt_configs FOR SELECT
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS "vendor_write_receipt_configs" ON public.receipt_configs;
CREATE POLICY "vendor_write_receipt_configs"
  ON public.receipt_configs FOR ALL
  USING (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'vendor')
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.get_user_role() = 'vendor');

-- Shop managers may only touch their own branch's row, and only via the
-- RPCs below (which force pending_approval = true) — no direct table
-- writes, so they can't self-approve or edit another branch.
DROP POLICY IF EXISTS "shop_manager_no_direct_write" ON public.receipt_configs;

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
  p_printer_connection TEXT
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
    tin, vat_number, footer_message, paper_width_mm, printer_connection,
    pending_approval, submitted_by, approved_by, approved_at
  ) VALUES (
    caller_tenant, p_branch_id, p_template_mode, p_store_name, p_store_address, p_store_contacts,
    p_tin, p_vat_number, p_footer_message, p_paper_width_mm, p_printer_connection,
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
    pending_approval = NOT is_vendor,
    submitted_by = auth.uid(),
    approved_by = CASE WHEN is_vendor THEN auth.uid() ELSE public.receipt_configs.approved_by END,
    approved_at = CASE WHEN is_vendor THEN NOW() ELSE public.receipt_configs.approved_at END,
    updated_at = NOW()
  RETURNING id INTO result_id;

  RETURN result_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_receipt_config(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_receipt_config(p_config_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID;
  caller_role TEXT;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role != 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can approve receipt config changes';
  END IF;

  UPDATE public.receipt_configs
  SET pending_approval = false, approved_by = auth.uid(), approved_at = NOW()
  WHERE id = p_config_id AND tenant_id = caller_tenant;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_receipt_config(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_receipt_config(p_config_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID;
  caller_role TEXT;
BEGIN
  SELECT role, tenant_id INTO caller_role, caller_tenant FROM public.users WHERE id = auth.uid();
  IF caller_role != 'vendor' THEN
    RAISE EXCEPTION 'Only the business owner can reject receipt config changes';
  END IF;

  DELETE FROM public.receipt_configs
  WHERE id = p_config_id AND tenant_id = caller_tenant AND pending_approval = true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_receipt_config(UUID) TO authenticated;
