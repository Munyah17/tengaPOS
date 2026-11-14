-- Branch transfer workflow: stock moving between branches is now a
-- documented, signed, two-sided procedure instead of an instant move.
--
-- Before: transfer_stock() decremented the source and credited the
-- destination in one shot -- no record of who authorised it, who packed
-- it, or who received it, and no way to stop a mistaken transfer.
--
-- Now: request -> dispatch (authorised sign-off, stock leaves source) ->
-- receive (destination sign-off, stock lands). Every step records who did
-- it, when, and a typed signature name, so the stock_transfers row itself
-- is the documentation. Segregation of duties: whoever dispatched a
-- transfer cannot be the same person who requested it.
--
-- Statuses: pending (requested, no stock moved) -> in_transit (dispatched,
-- source stock already decremented) -> received (destination credited).
-- pending can also become cancelled. Existing rows default to 'received'
-- since they were all completed instantly under the old flow.

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_signed_by TEXT,
  ADD COLUMN IF NOT EXISTS source_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dest_signed_by TEXT,
  ADD COLUMN IF NOT EXISTS dest_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receive_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_transfers_status_check'
  ) THEN
    ALTER TABLE public.stock_transfers
      ADD CONSTRAINT stock_transfers_status_check
      CHECK (status IN ('pending', 'in_transit', 'received', 'cancelled'));
  END IF;
END $$;

-- ─── request_stock_transfer ────────────────────────────────────────────────
-- Any branch staff member can raise a request. Nothing moves until an
-- authoriser dispatches it. The product must belong to a branch (its
-- branch_id is the source) -- shared/unassigned stock can't be "sent"
-- anywhere because there's no branch holding it.
CREATE OR REPLACE FUNCTION public.request_stock_transfer(
  p_tenant_id UUID, p_product_id UUID, p_to_branch_id UUID, p_qty NUMERIC, p_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; v_id UUID;
  prod RECORD; dest_branch RECORD;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL OR caller_tenant != p_tenant_id THEN
    RAISE EXCEPTION 'Not authorized for this tenant';
  END IF;
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor', 'cashier', 'shop_assistant') THEN
    RAISE EXCEPTION 'Not authorized to request stock transfers';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;

  SELECT * INTO prod FROM public.products WHERE id = p_product_id AND tenant_id = p_tenant_id;
  IF prod.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF prod.branch_id IS NULL THEN
    RAISE EXCEPTION 'This product is not assigned to a branch — assign it to a branch before transferring';
  END IF;
  IF prod.branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'Source and destination branch must be different';
  END IF;
  SELECT id INTO dest_branch FROM public.branches WHERE id = p_to_branch_id AND tenant_id = p_tenant_id;
  IF dest_branch.id IS NULL THEN RAISE EXCEPTION 'Destination branch not found'; END IF;

  INSERT INTO public.stock_transfers (tenant_id, product_id, from_branch_id, to_branch_id, qty, note, created_by, status)
  VALUES (p_tenant_id, p_product_id, prod.branch_id, p_to_branch_id, p_qty, NULLIF(p_note, ''), auth.uid(), 'pending')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'pending');
END;
$$;
GRANT EXECUTE ON FUNCTION public.request_stock_transfer(UUID, UUID, UUID, NUMERIC, TEXT) TO authenticated;

-- ─── dispatch_stock_transfer ────────────────────────────────────────────────
-- The authorisation step: a manager-level role signs off and the stock
-- physically leaves the source branch (decremented now, credited on
-- receipt). The dispatcher must NOT be the person who requested it --
-- that's the whole point of the sign-off.
CREATE OR REPLACE FUNCTION public.dispatch_stock_transfer(
  p_transfer_id UUID, p_signature TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; v_row RECORD; prod RECORD;
BEGIN
  IF NULLIF(btrim(COALESCE(p_signature, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A signature (your full name) is required to dispatch a transfer';
  END IF;

  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Only a manager can authorize a stock transfer';
  END IF;

  SELECT * INTO v_row FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = caller_tenant FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'This transfer is not awaiting authorization (status: %)', v_row.status;
  END IF;
  IF v_row.created_by = auth.uid() THEN
    RAISE EXCEPTION 'You cannot authorize a transfer you requested yourself — a second person must sign off';
  END IF;

  SELECT * INTO prod FROM public.products WHERE id = v_row.product_id FOR UPDATE;
  IF prod.stock_qty < v_row.qty THEN
    RAISE EXCEPTION 'Insufficient stock to dispatch — only % available', prod.stock_qty;
  END IF;

  UPDATE public.products
  SET stock_qty = stock_qty - v_row.qty, updated_at = NOW()
  WHERE id = v_row.product_id;

  UPDATE public.stock_transfers SET
    status = 'in_transit',
    approved_by = auth.uid(),
    approved_at = NOW(),
    source_signed_by = btrim(p_signature),
    source_signed_at = NOW()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('id', v_row.id, 'status', 'in_transit');
END;
$$;
GRANT EXECUTE ON FUNCTION public.dispatch_stock_transfer(UUID, TEXT) TO authenticated;

-- ─── receive_stock_transfer ────────────────────────────────────────────────
-- The destination side signs for what arrived. Credits the destination
-- branch's copy of the product (created by cloning the source if the
-- branch doesn't stock it yet) and closes the transfer out.
CREATE OR REPLACE FUNCTION public.receive_stock_transfer(
  p_transfer_id UUID, p_signature TEXT, p_note TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; v_row RECORD; src RECORD; dest_id UUID;
BEGIN
  IF NULLIF(btrim(COALESCE(p_signature, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A signature (your full name) is required to receive a transfer';
  END IF;

  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = caller_tenant FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_row.status <> 'in_transit' THEN
    RAISE EXCEPTION 'This transfer is not in transit (status: %)', v_row.status;
  END IF;

  -- Receiver must belong to the destination branch (or be vendor/manager
  -- overseeing it) -- same branch-membership rule as everywhere else.
  IF caller_role <> 'vendor' AND NOT EXISTS (
    SELECT 1 FROM public.get_user_branch_ids() g WHERE g = v_row.to_branch_id
  ) AND caller_role NOT IN ('shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Only staff assigned to the destination branch can receive this transfer';
  END IF;

  SELECT * INTO src FROM public.products WHERE id = v_row.product_id;

  -- Same "same item at the destination" lookup transfer_stock always used:
  -- the branch's own row for this SKU (or name when there's no SKU).
  SELECT id INTO dest_id FROM public.products
  WHERE tenant_id = caller_tenant AND branch_id = v_row.to_branch_id
    AND ((src.sku IS NOT NULL AND sku = src.sku) OR (src.sku IS NULL AND lower(name) = lower(src.name)))
  LIMIT 1;

  IF dest_id IS NULL THEN
    INSERT INTO public.products (
      tenant_id, branch_id, name, brand, sku, barcode, price, cost_price,
      stock_qty, low_stock_threshold, unit, image_url, image_unavailable,
      vat_treatment, attributes, category_id, is_active, pos_visible
    ) VALUES (
      caller_tenant, v_row.to_branch_id, src.name, src.brand, src.sku, src.barcode, src.price, src.cost_price,
      v_row.qty, src.low_stock_threshold, src.unit, src.image_url, src.image_unavailable,
      src.vat_treatment, src.attributes, src.category_id, true, true
    ) RETURNING id INTO dest_id;
  ELSE
    UPDATE public.products SET stock_qty = stock_qty + v_row.qty, updated_at = NOW() WHERE id = dest_id;
  END IF;

  UPDATE public.stock_transfers SET
    status = 'received',
    dest_product_id = dest_id,
    received_by = auth.uid(),
    received_at = NOW(),
    dest_signed_by = btrim(p_signature),
    dest_signed_at = NOW(),
    receive_note = NULLIF(p_note, '')
  WHERE id = v_row.id;

  RETURN jsonb_build_object('id', v_row.id, 'status', 'received', 'dest_product_id', dest_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.receive_stock_transfer(UUID, TEXT, TEXT) TO authenticated;

-- ─── cancel_stock_transfer ─────────────────────────────────────────────────
-- Only while still pending -- once dispatched the stock has physically left
-- the source and the fix is a reverse transfer, not a cancel.
CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(p_transfer_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_tenant UUID; caller_role TEXT; v_row RECORD;
BEGIN
  SELECT tenant_id, role INTO caller_tenant, caller_role FROM public.users WHERE id = auth.uid();
  IF caller_tenant IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.stock_transfers
  WHERE id = p_transfer_id AND tenant_id = caller_tenant FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Only a pending transfer can be cancelled (status: %)', v_row.status;
  END IF;
  IF v_row.created_by <> auth.uid() AND caller_role NOT IN ('vendor', 'shop_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Only the requester or a manager can cancel this transfer';
  END IF;

  UPDATE public.stock_transfers SET status = 'cancelled' WHERE id = v_row.id;
  RETURN jsonb_build_object('id', v_row.id, 'status', 'cancelled');
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_stock_transfer(UUID) TO authenticated;
