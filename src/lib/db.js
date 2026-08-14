import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { generateReceiptNumber, generateDocNumber, parseOptionalNumber, parseOptionalMoney } from '@/utils/formatters'
import { isStaleJwtError, refreshSessionOnce } from '@/lib/authRetry'
import { generateUUID } from '@/lib/uuid'

// process_checkout errors matching one of these are things the cashier can
// actually do something about (re-check stock, get a manager, re-scan an
// item) -- safe to show verbatim. Anything else is an internal/infra
// failure and gets a generic message instead (see saveCheckout below).
const CHECKOUT_SAFE_ERROR_PATTERNS = [
  /insufficient stock/i,
  /invalid quantity/i,
  /product not found/i,
  /total exceeds the priced value/i,
  /discount authorization/i,
  /manager authorization/i,
  /not authorized for this tenant/i,
]

// ─── Products ────────────────────────────────────────────────────────────────

// A session token signed under a since-rotated key fails verification on
// every call that uses it -- not "expired", so autoRefreshToken never
// proactively replaces it, and every read just silently comes back empty
// or throws forever with the same stale token (see isStaleJwtError).
// saveCheckout already refreshes-and-retries once for exactly this; POS/
// Inventory's own product fetch never did, so a tenant hitting this
// mid-session would see "no products" with no obvious error rather than
// a clear failure -- reported live as items/inventory silently not
// appearing. This is the single most-called read in the app (every POS
// and Inventory load), so it gets the same resilience checkout has.
export async function fetchProducts(tenantId, _retried = false) {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name')
  if (error) {
    if (!_retried && isStaleJwtError(error.message) && await refreshSessionOnce(supabase)) {
      return fetchProducts(tenantId, true)
    }
    throw error
  }
  return data.map(p => ({
    ...p,
    stock: p.stock_qty ?? 0,
    category: p.categories?.name ?? '',
    image: p.image_url ?? null,
    barcode: p.barcode ?? '',
    imageUnavailable: p.image_unavailable === true,
  }))
}

export async function insertProduct(tenantId, product) {
  const { data, error } = await supabase
    .from('products')
    .insert({
      tenant_id: tenantId,
      name: product.name,
      brand: product.brand || null,
      sku: product.sku || null,
      barcode: product.barcode || null,
      price: parseOptionalMoney(product.price),
      // landing price (what it cost you) — powers margins & AI insights
      cost_price: parseOptionalMoney(product.landingPrice !== undefined && product.landingPrice !== '' ? product.landingPrice : product.costPrice),
      // A service has no stock to run out of — always 0, never gated on
      // the qty field the form hides for it (see process_checkout, which
      // also skips the stock check entirely when is_service is true).
      stock_qty: product.isService ? 0 : parseOptionalNumber(product.stock),
      low_stock_threshold: parseInt(product.lowStockThreshold) || 10,
      is_service: product.isService === true,
      unit: product.unit || null,
      image_url: product.imageUrl || null,
      image_unavailable: product.imageUnavailable === true,
      vat_treatment: product.vatTreatment || 'standard',
      attributes: product.attributes || {},
      branch_id: product.branchId || null,
      category_id: product.categoryId || null,
      // Hardware Mode bulk/trade pricing — [{ min_qty, price }], highest
      // qualifying tier wins. Empty for every other tenant.
      price_tiers: (product.priceTiers || []).filter((t) => t.min_qty > 0 && t.price >= 0),
      // Pharmacy Mode — 'otc' (default) needs nothing extra at checkout;
      // 'prescription'/'controlled' gate the sale on prescriber details.
      dispensing_class: product.dispensingClass || 'otc',
      controlled_schedule: product.dispensingClass === 'controlled' ? (product.controlledSchedule || null) : null,
      // Bar/Liquor Store Mode — gates the sale on an ID/age check at checkout.
      age_restricted: product.ageRestricted === true,
      is_active: true,
      pos_visible: true,
    })
    .select()
    .single()
  if (error) throw error
  return { ...data, stock: data.stock_qty ?? 0, category: '', barcode: data.barcode ?? '', image: data.image_url ?? null }
}

// Mass Import for large catalogs: one array .insert() per chunk instead of
// N individual round trips (the previous Promise.allSettled-per-row
// approach fired thousands of simultaneous requests for a large stock
// file, hit the browser's per-origin connection limit, and gave zero
// feedback for what could be a multi-minute operation -- looked hung).
// 500 rows/chunk keeps each request body small and each one fast enough
// that onProgress can update between chunks.
const BULK_INSERT_CHUNK_SIZE = 500

export async function bulkInsertProducts(tenantId, rows, onProgress) {
  let inserted = 0
  const failedChunks = []
  for (let i = 0; i < rows.length; i += BULK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BULK_INSERT_CHUNK_SIZE).map((product) => ({
      tenant_id: tenantId,
      name: product.name,
      brand: product.brand || null,
      sku: product.sku || null,
      barcode: product.barcode || null,
      price: parseOptionalMoney(product.price),
      cost_price: parseOptionalMoney(product.landingPrice),
      stock_qty: product.isService ? 0 : parseOptionalNumber(product.stock),
      low_stock_threshold: parseInt(product.lowStockThreshold) || 10,
      is_service: product.isService === true,
      image_url: product.imageUrl || null,
      image_unavailable: product.imageUnavailable === true,
      vat_treatment: product.vatTreatment || 'standard',
      attributes: product.attributes || {},
      branch_id: product.branchId || null,
      category_id: product.categoryId || null,
      is_active: true,
      pos_visible: true,
    }))
    const { error, count } = await supabase.from('products').insert(chunk, { count: 'exact' })
    if (error) {
      failedChunks.push({ from: i, to: i + chunk.length, message: error.message })
    } else {
      inserted += count ?? chunk.length
    }
    onProgress?.(Math.min(i + BULK_INSERT_CHUNK_SIZE, rows.length), rows.length)
  }
  return { inserted, total: rows.length, failedChunks }
}

// stock_qty is deliberately NOT part of the general edit payload below
// (only ever set when converting TO a service, which has none). It used
// to blindly overwrite stock_qty with whatever the edit form had
// snapshotted when it was opened -- if a sale or stock receipt happened
// on that same product in the meantime (very plausible in a busy shop, or
// across a queued offline edit that replays later), submitting the edit
// silently reverted stock back to the stale number, undoing the real
// change with no error or trace. All *intentional* stock corrections now
// go through Receive Stock / Stock Take / Transfer Stock instead, which
// apply a locked, relative delta rather than an unconditional overwrite --
// see stock_receipts.sql / stock_take.sql / stock_transfers.sql.
export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products')
    .update({
      name: updates.name,
      brand: updates.brand || null,
      sku: updates.sku || null,
      barcode: updates.barcode || null,
      price: parseOptionalMoney(updates.price),
      cost_price: parseOptionalMoney(updates.landingPrice),
      ...(updates.isService === true ? { stock_qty: 0 } : {}),
      low_stock_threshold: parseInt(updates.lowStockThreshold) || 10,
      is_service: updates.isService === true,
      unit: updates.unit || null,
      image_url: updates.imageUrl || null,
      image_unavailable: updates.imageUnavailable === true,
      vat_treatment: updates.vatTreatment || 'standard',
      attributes: updates.attributes || {},
      branch_id: updates.branchId || null,
      category_id: updates.categoryId || null,
      price_tiers: (updates.priceTiers || []).filter((t) => t.min_qty > 0 && t.price >= 0),
      dispensing_class: updates.dispensingClass || 'otc',
      controlled_schedule: updates.dispensingClass === 'controlled' ? (updates.controlledSchedule || null) : null,
      age_restricted: updates.ageRestricted === true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return { ...data, stock: data.stock_qty ?? 0, image: data.image_url ?? null }
}

// ─── Categories ────────────────────────────────────────────────────────────

export async function fetchCategories(tenantId) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) throw error
  return data
}

export async function createCategory(tenantId, { name, color }) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ tenant_id: tenantId, name, color: color || null })
    .select()
    .single()
  if (error) throw error
  return data
}

// Upload a product photo to storage; returns its public URL
export async function uploadProductImage(tenantId, file) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('product-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('product-images').getPublicUrl(path)
  return data.publicUrl
}

// Uploads a generated receipt PDF into the private 'receipts' bucket, then
// asks send-whatsapp-receipt to mint a short-lived signed URL for it and
// push it to the given phone. Paid add-on -- the edge function is what
// actually enforces tenants.features.whatsapp_receipts, this just carries
// the two steps (upload, then send) as one call for the caller.
export async function sendReceiptViaWhatsApp(tenantId, phone, pdfBlob, receiptNumber) {
  const path = `${tenantId}/${Date.now()}-${receiptNumber || 'receipt'}.pdf`
  const { error: uploadErr } = await supabase.storage.from('receipts').upload(path, pdfBlob, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (uploadErr) throw uploadErr

  const { data: { session } } = await supabase.auth.getSession()
  const { data, error } = await supabase.functions.invoke('send-whatsapp-receipt', {
    body: { tenant_id: tenantId, phone, storage_path: path, filename: `Receipt-${receiptNumber || 'tengaPOS'}.pdf`, receipt_number: receiptNumber },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })
  if (error) {
    let msg = error.message
    try { const ctx = await error.context?.json(); if (ctx?.error) msg = ctx.error } catch { /* keep default */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Upload a site asset (e.g. announcement popup background) to storage; returns its public URL
export async function uploadSiteAsset(file) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('site-assets').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('site-assets').getPublicUrl(path)
  return data.publicUrl
}

export async function deleteProduct(id) {
  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// ─── Checkout / POS ──────────────────────────────────────────────────────────

export async function saveCheckout({ tenantId, branchId, userId, cartItems, paymentMethod, subtotal, tax, total, posMode, orderType, receiptNo: receiptNoIn, clientRef: clientRefIn, salespersonName, salespersonEmployeeNo, discountAuthId }, _retried = false) {
  // clientRef is the real idempotency key — a UUID with no meaningful
  // collision risk, generated once by the caller and reused on every retry
  // (a live retry queued after a network blip, or an offline-sync replay).
  // process_checkout runs the stock reservation + order + order_items +
  // transaction as one atomic, idempotent call keyed on this — if this
  // exact clientRef was already processed, it returns that order instead
  // of reprocessing it.
  //
  // receiptNo is a SEPARATE, purely cosmetic printed number. It used to
  // double as the dedup key too, but its random suffix only had 10,000
  // slots/tenant/day — busy tenants hit real collisions between totally
  // unrelated sales, which silently short-circuited the second sale as
  // "already processed" (no new order, no stock decrement, no error).
  const receiptNo = receiptNoIn || generateReceiptNumber(null, cartItems?.[0]?.name)
  const clientRef = clientRefIn || generateUUID()

  const grossTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discountAmount = Math.max(0, grossTotal - total)

  const isUUID = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v))

  const items = cartItems.map(item => ({
    product_id: isUUID(item.id) ? item.id : null,
    name: item.name,
    sku: item.sku || null,
    qty: item.quantity,
    unit_price: item.price,
    discount: item.itemDiscount || 0,
    total: item.price * item.quantity * (1 - (item.itemDiscount || 0) / 100),
  }))

  const { data, error } = await supabase.rpc('process_checkout', {
    p_tenant_id: tenantId,
    p_branch_id: branchId || null,
    p_user_id: userId || null,
    p_receipt_no: receiptNo,
    p_status: posMode === 'restaurant' ? 'received' : 'completed',
    p_type: orderType || 'sale',
    p_pos_mode: posMode || 'retail',
    p_subtotal: subtotal,
    p_tax: tax,
    p_discount: discountAmount,
    p_total: total,
    p_payment_method: paymentMethod || 'cash',
    p_items: items,
    p_salesperson_name: salespersonName || null,
    p_salesperson_employee_no: salespersonEmployeeNo || null,
    p_client_ref: clientRef,
    p_discount_auth_id: discountAuthId || null,
  })
  if (error) {
    // A session token minted before a JWT signing-key rotation fails
    // verification here identically every time (autoRefreshToken only
    // refreshes on expiry, not on a retired signing key) -- misclassifying
    // this as a generic failure means it gets queued offline and retried
    // forever with the same stale token, never actually reaching the
    // server. Refresh once and retry with the exact same clientRef/receiptNo
    // (safe — process_checkout is idempotent on clientRef).
    if (!_retried && isStaleJwtError(error.message) && await refreshSessionOnce(supabase)) {
      return saveCheckout({
        tenantId, branchId, userId, cartItems, paymentMethod, subtotal, tax, total, posMode, orderType,
        receiptNo, clientRef, salespersonName, salespersonEmployeeNo, discountAuthId,
      }, true)
    }
    // Only ever show the cashier a message that's actually theirs to act
    // on (out of stock, needs a manager's discount approval, etc.) --
    // anything else (a stale PostgREST schema cache after a migration, a
    // dropped connection, a genuine bug) used to get dumped straight into
    // the checkout toast verbatim, e.g. "Could not find the function
    // public.process_checkout(p_branch_id, p_client_ref, ...) in the
    // schema cache" -- confusing, and it hands a stranger the exact
    // internal parameter names of a money-handling function for free.
    // The real error is still logged to the console for support to see.
    const safeToShow = CHECKOUT_SAFE_ERROR_PATTERNS.some((p) => p.test(error.message || ''))
    if (!safeToShow) console.error('process_checkout RPC error:', error)
    throw new Error(safeToShow ? error.message : 'Checkout failed — please try again, or contact support if this keeps happening.')
  }

  return { order: { id: data.order_id }, receiptNo: data.receipt_no }
}

// Manager types their own email+password into a modal on the POS -- this
// spins up a throwaway, non-persisted Supabase client to verify it (a
// real, server-checked login that never touches the cashier's own
// session/localStorage), then uses THAT client's own freshly-authenticated
// session to call authorize_discount_override, so the RPC's auth.uid() is
// genuinely the manager. The throwaway client is discarded immediately
// after -- nothing about it is ever persisted or reused.
export async function authorizeDiscountOverride(tenantId, branchId, requestedBy, managerEmail, managerPassword, maxDiscountPct) {
  const managerClient = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const { error: signInError } = await managerClient.auth.signInWithPassword({
    email: managerEmail, password: managerPassword,
  })
  if (signInError) throw new Error('Incorrect manager email or password')

  const { data, error } = await managerClient.rpc('authorize_discount_override', {
    p_tenant_id: tenantId,
    p_branch_id: branchId || null,
    p_requested_by: requestedBy || null,
    p_max_discount_pct: maxDiscountPct,
  })
  await managerClient.auth.signOut({ scope: 'local' })
  if (error) throw new Error(error.message?.replace(/^.*?: /, '') || 'Not authorized to approve this discount')
  return data
}

// ─── Payment Sessions (Paynow) ────────────────────────────────────────────────

export async function fetchPaymentSessions(tenantId) {
  const { data, error } = await supabase
    .from('payment_sessions')
    .select('*, users(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data
}

export async function approvePaymentSession(sessionId, userId, note = '') {
  const { data: session, error: fetchErr } = await supabase
    .from('payment_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  if (fetchErr) throw fetchErr

  const { error: updateErr } = await supabase
    .from('payment_sessions')
    .update({
      status: 'paid',
      manually_confirmed: true,
      confirmed_by: userId || null,
      admin_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
  if (updateErr) throw updateErr

  // Create a transaction record so it shows in Transactions page
  const receiptNo = session.reference
  const { error: txErr } = await supabase
    .from('transactions')
    .insert({
      tenant_id: session.tenant_id,
      type: 'sale',
      method: 'paynow',
      amount: session.amount,
      reference: receiptNo,
      status: 'completed',
    })
  if (txErr) throw txErr
}

export async function declinePaymentSession(sessionId, userId, note = '') {
  const { error } = await supabase
    .from('payment_sessions')
    .update({
      status: 'cancelled',
      manually_confirmed: true,
      confirmed_by: userId || null,
      admin_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
  if (error) throw error
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function fetchOrders(tenantId, filters = {}) {
  let q = supabase
    .from('orders')
    .select('*, order_items(*, products(category_id, attributes, categories(name))), users(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (filters.posMode) q = q.eq('pos_mode', filters.posMode)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.notStatus) q = q.neq('status', filters.notStatus)
  if (filters.fromDate) q = q.gte('created_at', filters.fromDate)
  if (filters.toDate) q = q.lte('created_at', filters.toDate)
  // The 200-row cap only makes sense for unbounded callers (Orders.jsx,
  // POS.jsx's recent-staff-orders, etc). Callers that scope by date range
  // (Ledger/Financial Reports) rely on that range to bound the result
  // instead -- otherwise a busy tenant's "This Year" report would silently
  // drop older rows within the very range it's supposed to total.
  if (!filters.fromDate && !filters.toDate) q = q.limit(200)

  const { data, error } = await q
  if (error) throw error
  return data
}

// Vendor-only, deletes the order + its transaction(s) + line items in one
// go (see delete_order RPC). Same underlying record whether reached from
// Orders.jsx or Transactions.jsx.
export async function deleteOrder(orderId) {
  const { error } = await supabase.rpc('delete_order', { p_order_id: orderId })
  if (error) throw error
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function fetchTransactions(tenantId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, orders(order_no, subtotal, tax_amount, total, order_items(product_id, name, qty, unit_price)), users(name), branches(name)')
    .eq('tenant_id', tenantId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data
}

// Vendor-only bulk cleanup: archives (never deletes) the transaction rows
// for every already-validated void, so old voided clutter can be tidied out
// of the main list. Logs the action to tenant_activity_log.
export async function clearVoidedTransactions() {
  const { data, error } = await supabase.rpc('clear_voided_transactions')
  if (error) throw error
  return data
}

export async function fetchTenantActivityLog(tenantId, limit = 50) {
  const { data, error } = await supabase
    .from('tenant_activity_log')
    .select('*, users(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}

// ─── Hardware Mode: Equipment Rentals ──────────────────────────────────────

export async function fetchEquipmentRentals(tenantId) {
  const { data, error } = await supabase
    .from('equipment_rentals')
    .select('*, branches(name)')
    .eq('tenant_id', tenantId)
    .order('checked_out_at', { ascending: false })
  if (error) throw error
  return data
}

export async function checkOutEquipment(tenantId, userId, rental) {
  const { data, error } = await supabase.from('equipment_rentals').insert({
    tenant_id: tenantId,
    branch_id: rental.branchId || null,
    item_name: rental.itemName,
    product_id: rental.productId || null,
    customer_name: rental.customerName,
    customer_phone: rental.customerPhone || null,
    daily_rate: Number(rental.dailyRate) || 0,
    deposit_amount: Number(rental.depositAmount) || 0,
    due_back_at: rental.dueBackAt,
    notes: rental.notes || null,
    created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}

export async function returnEquipment(id, { lateFee, depositReturned, notes }) {
  const { data, error } = await supabase
    .from('equipment_rentals')
    .update({
      returned_at: new Date().toISOString(),
      late_fee: lateFee != null ? Number(lateFee) : null,
      deposit_returned: depositReturned === true,
      notes: notes || null,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEquipmentRental(id) {
  const { error } = await supabase.from('equipment_rentals').delete().eq('id', id)
  if (error) throw error
}

// ─── Void transactions ───────────────────────────────────────────────────────
// Anyone can request; Shop Manager/Supervisor can approve; only Vendor can
// give final validation, which is the step that actually restores stock.

export async function fetchVoids(tenantId) {
  const { data, error } = await supabase
    .from('voids')
    .select(`
      *,
      orders(order_no),
      requester:users!voids_requested_by_fkey(name),
      approver:users!voids_approved_by_fkey(name),
      validator:users!voids_validated_by_fkey(name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function requestVoid(orderId, reason) {
  const { data, error } = await supabase.rpc('request_void', { p_order_id: orderId, p_reason: reason })
  if (error) throw error
  return data
}

export async function approveVoid(voidId) {
  const { error } = await supabase.rpc('approve_void', { p_void_id: voidId })
  if (error) throw error
}

export async function validateVoid(voidId) {
  const { error } = await supabase.rpc('validate_void', { p_void_id: voidId })
  if (error) throw error
}

export async function rejectVoid(voidId, reason) {
  const { error } = await supabase.rpc('reject_void', { p_void_id: voidId, p_reason: reason || null })
  if (error) throw error
}

// ─── Returns / Refunds ────────────────────────────────────────────────────────
// Same approval tiers as voids, but validating one restores stock AND
// records an actual refund transaction (goods were sold and are coming back).

export async function fetchReturns(tenantId) {
  const { data, error } = await supabase
    .from('returns')
    .select(`
      *,
      orders(order_no),
      requester:users!returns_requested_by_fkey(name),
      approver:users!returns_approved_by_fkey(name),
      validator:users!returns_validated_by_fkey(name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function requestReturn(orderId, reason, refundAmount) {
  const { data, error } = await supabase.rpc('request_return', {
    p_order_id: orderId, p_reason: reason, p_refund_amount: refundAmount,
  })
  if (error) throw error
  return data
}

export async function approveReturn(returnId) {
  const { error } = await supabase.rpc('approve_return', { p_return_id: returnId })
  if (error) throw error
}

export async function validateReturn(returnId, goodsCondition, notes) {
  const { error } = await supabase.rpc('validate_return', {
    p_return_id: returnId, p_goods_condition: goodsCondition, p_inspection_notes: notes || null,
  })
  if (error) throw error
}

export async function rejectReturn(returnId, reason) {
  const { error } = await supabase.rpc('reject_return', { p_return_id: returnId, p_reason: reason || null })
  if (error) throw error
}

// ─── Kitchen / Restaurant orders ─────────────────────────────────────────────

export async function fetchKitchenOrders(tenantId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('tenant_id', tenantId)
    .eq('pos_mode', 'restaurant')
    .not('status', 'in', '("completed","cancelled")')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function advanceKitchenOrder(orderId, nextStatus) {
  const { error } = await supabase
    .from('orders')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw error
}

export async function completeKitchenOrder(orderId) {
  const { error } = await supabase
    .from('orders')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw error
}

// Super Admin's "organisation manage" needs the actual vendor/owner
// person's name, not just the business (tenants.name) -- these are two
// different things (e.g. "Metros Investments" the business, "Rudo
// Chikwanha" the person who owns it).
export async function fetchTenantVendor(tenantId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('tenant_id', tenantId)
    .eq('role', 'vendor')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return data
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export async function fetchStaff(tenantId) {
  // users has no branch_id FK — embedding branches() breaks PostgREST
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('name')
  if (error) throw error
  return data
}

export async function updateStaffStatus(userId, isActive) {
  const { error } = await supabase
    .from('users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

export async function updateStaffUsername(userId, username) {
  const { error } = await supabase
    .from('users')
    .update({ username, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

export async function updateStaffEmployeeNo(userId, employeeNo) {
  const { error } = await supabase
    .from('users')
    .update({ employee_no: employeeNo || null, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

export async function updateStaffName(userId, name) {
  const { error } = await supabase
    .from('users')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function fetchTasks(tenantId) {
  // Explicit aliases are required here — embedding `users` twice via two
  // different FK hints with no alias makes PostgREST error on every single
  // call ("table name ... specified more than once"), which was silently
  // swallowed client-side and made every assigned task disappear.
  const { data, error } = await supabase
    .from('tasks')
    .select('*, assignee:users!tasks_assigned_to_fkey(name, role), assignor:users!tasks_created_by_fkey(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertTask(tenantId, creatorId, task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      tenant_id: tenantId,
      created_by: creatorId,
      assigned_to: task.assignedTo || null,
      title: task.title,
      description: task.description || null,
      priority: task.priority || 'medium',
      status: 'pending',
      due_date: task.dueDate || null,
    })
    .select('*, assignee:users!tasks_assigned_to_fkey(name, role)')
    .single()
  if (error) throw error
  return data
}

export async function updateTaskStatus(taskId, status) {
  const { error } = await supabase
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', taskId)
  if (error) throw error
}

export async function deleteTask(taskId) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}

export async function fetchTaskComments(taskId) {
  const { data, error } = await supabase
    .from('task_comments')
    .select('*, author:users!task_comments_author_id_fkey(name, role)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function insertTaskComment(taskId, tenantId, authorId, message) {
  const { data, error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, tenant_id: tenantId, author_id: authorId, message })
    .select('*, author:users!task_comments_author_id_fkey(name, role)')
    .single()
  if (error) throw error
  return data
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function fetchBranches(tenantId) {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('is_main', { ascending: false })
  if (error) throw error
  return data
}

// ─── Stock Transfers (branch to branch) ────────────────────────────────────

export async function fetchStockTransfers(tenantId) {
  const { data, error } = await supabase
    .from('stock_transfers')
    .select(`
      *,
      products(name, sku),
      from_branch:branches!stock_transfers_from_branch_id_fkey(name),
      to_branch:branches!stock_transfers_to_branch_id_fkey(name),
      users(name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

// Moves quantity from one branch's copy of a product to another's, creating
// the destination branch's product row (cloned from the source) if it
// doesn't have one yet. See stock_transfers.sql for why -- stock lives on
// the product row itself, not in a separate per-branch table.
export async function transferStock(tenantId, productId, toBranchId, qty, note) {
  const { data, error } = await supabase.rpc('transfer_stock', {
    p_tenant_id: tenantId,
    p_product_id: productId,
    p_to_branch_id: toBranchId,
    p_qty: qty,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

// ─── Stock Receipts (add to existing stock, with an audit trail) ──────────

export async function fetchStockReceipts(tenantId) {
  const { data, error } = await supabase
    .from('stock_receipts')
    .select('*, products(name, sku), users(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

// Adds qty on top of whatever stock the product already has -- never
// overwrites it -- so a delivery of 20 more of an item already at 5 always
// lands on 25, with no risk of someone fat-fingering the edit-product
// stock field and silently losing the difference. See stock_receipts.sql.
export async function receiveStock(tenantId, productId, qty, note) {
  const { data, error } = await supabase.rpc('receive_stock', {
    p_tenant_id: tenantId,
    p_product_id: productId,
    p_qty: qty,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

// ─── Stock Take (physical count vs system count) ──────────────────────────

export async function fetchStockTakes(tenantId) {
  const { data, error } = await supabase
    .from('stock_takes')
    .select('*, branches(name), starter:users!stock_takes_started_by_fkey(name), completer:users!stock_takes_completed_by_fkey(name)')
    .eq('tenant_id', tenantId)
    .order('started_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

export async function fetchStockTakeCounts(stockTakeId) {
  const { data, error } = await supabase
    .from('stock_take_counts')
    .select('*, products(name, sku), users(name)')
    .eq('stock_take_id', stockTakeId)
    .order('counted_at', { ascending: false })
  if (error) throw error
  return data
}

export async function startStockTake(tenantId, branchId, note) {
  const { data, error } = await supabase.rpc('start_stock_take', {
    p_tenant_id: tenantId, p_branch_id: branchId || null, p_note: note || null,
  })
  if (error) throw error
  return data
}

export async function recordStockTakeCount(stockTakeId, productId, countedQty, note) {
  const { data, error } = await supabase.rpc('record_stock_take_count', {
    p_stock_take_id: stockTakeId, p_product_id: productId, p_counted_qty: countedQty, p_note: note || null,
  })
  if (error) throw error
  return data
}

export async function finalizeStockTake(stockTakeId) {
  const { data, error } = await supabase.rpc('finalize_stock_take', { p_stock_take_id: stockTakeId })
  if (error) throw error
  return data
}

// ─── Cash-Up (daily cash reconciliation) ───────────────────────────────────

export async function fetchCashUps(tenantId) {
  const { data, error } = await supabase
    .from('cash_ups')
    .select('*, branches(name), opener:users!cash_ups_opened_by_fkey(name), closer:users!cash_ups_closed_by_fkey(name)')
    .eq('tenant_id', tenantId)
    .order('opened_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

export async function openCashUp(tenantId, branchId, openingFloat, shiftId) {
  const { data, error } = await supabase.rpc('open_cash_up', {
    p_tenant_id: tenantId, p_branch_id: branchId || null, p_opening_float: openingFloat, p_shift_id: shiftId || null,
  })
  if (error) throw error
  return data
}

export async function closeCashUp(cashUpId, countedCash, notes) {
  const { data, error } = await supabase.rpc('close_cash_up', {
    p_cash_up_id: cashUpId, p_counted_cash: countedCash, p_notes: notes || null,
  })
  if (error) throw error
  return data
}

// The review-discipline gap: Cash-Up and Refund Auditing only help if the
// vendor actually opens them. This is the two cheap counts a Dashboard
// nudge needs to prompt that -- no new tables, just a same-day cash-up
// check and a week's worth of validated returns/voids.
export async function fetchVendorNudges(tenantId) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)

  const [cashUpRes, returnsRes, voidsRes] = await Promise.all([
    supabase.from('cash_ups').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('opened_at', todayStart.toISOString()),
    supabase.from('returns').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'validated').gte('validated_at', weekAgo.toISOString()),
    supabase.from('voids').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'validated').gte('validated_at', weekAgo.toISOString()),
  ])
  if (cashUpRes.error) throw cashUpRes.error
  if (returnsRes.error) throw returnsRes.error
  if (voidsRes.error) throw voidsRes.error

  return {
    cashUpMissingToday: (cashUpRes.count || 0) === 0,
    refundsThisWeek: (returnsRes.count || 0) + (voidsRes.count || 0),
  }
}

// ─── Refund Auditing (read-only, no new write path) ────────────────────────
// Groups validated returns/voids by the ORIGINAL sale's cashier (orders.
// served_by) -- not who merely requested the return, since request/approve/
// validate can each be a different person -- and computes each cashier's
// refund rate against their own total sales in the same period, flagging
// anyone whose rate is a statistical outlier (mean + 2 std devs, gated on a
// minimum sample so a low-volume staffer's one refund doesn't look alarming).
export async function fetchRefundAuditData(tenantId, { startDate, endDate } = {}) {
  const now = new Date()
  const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const end = endDate || now.toISOString()

  const [ordersRes, returnsRes, voidsRes] = await Promise.all([
    supabase.from('orders')
      .select('served_by, total, created_at, users(name)')
      .eq('tenant_id', tenantId).gte('created_at', start).lte('created_at', end),
    supabase.from('returns')
      .select('id, refund_amount, requested_by, approved_by, validated_at, orders(order_no, served_by, users(name))')
      .eq('tenant_id', tenantId).eq('status', 'validated').gte('validated_at', start).lte('validated_at', end),
    supabase.from('voids')
      .select('id, requested_by, approved_by, validated_at, orders(order_no, total, served_by, users(name))')
      .eq('tenant_id', tenantId).eq('status', 'validated').gte('validated_at', start).lte('validated_at', end),
  ])
  if (ordersRes.error) throw ordersRes.error
  if (returnsRes.error) throw returnsRes.error
  if (voidsRes.error) throw voidsRes.error

  const byCashier = {} // served_by -> { userId, name, salesTotal, refundCount, refundValue }
  const ensure = (userId, name) => {
    if (!userId) return null
    if (!byCashier[userId]) byCashier[userId] = { userId, name: name || 'Unknown', salesTotal: 0, refundCount: 0, refundValue: 0 }
    return byCashier[userId]
  }

  for (const o of ordersRes.data || []) {
    const row = ensure(o.served_by, o.users?.name)
    if (row) row.salesTotal += parseFloat(o.total || 0)
  }

  const sameActorFlags = []
  for (const r of returnsRes.data || []) {
    const servedBy = r.orders?.served_by
    const row = ensure(servedBy, r.orders?.users?.name)
    if (row) { row.refundCount += 1; row.refundValue += parseFloat(r.refund_amount || 0) }
    if (r.requested_by && r.requested_by === r.approved_by) {
      sameActorFlags.push({ type: 'return', id: r.id, orderNo: r.orders?.order_no })
    }
  }
  for (const v of voidsRes.data || []) {
    const servedBy = v.orders?.served_by
    const row = ensure(servedBy, v.orders?.users?.name)
    if (row) { row.refundCount += 1; row.refundValue += parseFloat(v.orders?.total || 0) }
    if (v.requested_by && v.requested_by === v.approved_by) {
      sameActorFlags.push({ type: 'void', id: v.id, orderNo: v.orders?.order_no })
    }
  }

  const cashiers = Object.values(byCashier).map((c) => ({
    ...c, refundRate: c.salesTotal > 0 ? (c.refundValue / c.salesTotal) * 100 : 0,
  }))

  // Outlier flag: mean + 2 standard deviations, only among cashiers with
  // enough sample size to mean anything (avoids flagging someone who's
  // barely sold anything and had one small refund).
  const MIN_REFUNDS = 5
  const eligible = cashiers.filter((c) => c.refundCount >= MIN_REFUNDS)
  const rates = eligible.map((c) => c.refundRate)
  const mean = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : 0
  const variance = rates.length ? rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length : 0
  const stdDev = Math.sqrt(variance)
  const outlierThreshold = mean + 2 * stdDev

  const flagged = eligible
    .filter((c) => c.refundRate > outlierThreshold && outlierThreshold > 0)
    .map((c) => c.userId)

  return {
    cashiers: cashiers.sort((a, b) => b.refundValue - a.refundValue).map((c) => ({ ...c, outlier: flagged.includes(c.userId) })),
    sameActorFlags,
    mean, stdDev,
  }
}

// ─── Auto-restock (low-stock reorder suggestions) ──────────────────────────
// Same low-stock rule already used for the notification bell
// (useTenantNotifications.js), just given its own dedicated view. Suggested
// qty is simple par-level (reorder back up to double the threshold) --
// deterministic, no historical-sales query needed for v1.
export async function fetchReorderSuggestions(tenantId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, stock_qty, low_stock_threshold, cost_price, unit')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('is_service', false)
  if (error) throw error
  return (data || [])
    .filter((p) => p.stock_qty <= (p.low_stock_threshold ?? 10))
    .map((p) => {
      const threshold = p.low_stock_threshold ?? 10
      return { ...p, suggestedQty: Math.max(1, threshold * 2 - (p.stock_qty ?? 0)) }
    })
    .sort((a, b) => (a.stock_qty ?? 0) - (b.stock_qty ?? 0))
}

// ─── Manufacturing Mode: Bill of Materials + Production Runs ──────────────

export async function fetchBillOfMaterials(tenantId, finishedProductId) {
  const { data, error } = await supabase
    .from('bill_of_materials')
    .select('*, component:products!bill_of_materials_component_product_id_fkey(name, stock_qty, unit)')
    .eq('tenant_id', tenantId)
    .eq('finished_product_id', finishedProductId)
  if (error) throw error
  return data
}

// Whole-tenant BOM, for the Production Reports component-consumption
// breakdown — unlike fetchBillOfMaterials, not scoped to one finished product.
export async function fetchAllBillOfMaterials(tenantId) {
  const { data, error } = await supabase
    .from('bill_of_materials')
    .select('*, component:products!bill_of_materials_component_product_id_fkey(name, unit)')
    .eq('tenant_id', tenantId)
  if (error) throw error
  return data
}

// Replaces the whole BOM for a finished product with the given component
// list — simplest correct way to save an edited list (add/remove/change
// qty) without diffing row by row.
export async function saveBillOfMaterials(tenantId, finishedProductId, components) {
  const { error: delErr } = await supabase
    .from('bill_of_materials')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('finished_product_id', finishedProductId)
  if (delErr) throw delErr

  const clean = components.filter((c) => c.component_product_id && c.qty_per_unit > 0)
  if (clean.length === 0) return []

  const { data, error } = await supabase
    .from('bill_of_materials')
    .insert(clean.map((c) => ({
      tenant_id: tenantId,
      finished_product_id: finishedProductId,
      component_product_id: c.component_product_id,
      qty_per_unit: c.qty_per_unit,
    })))
    .select()
  if (error) throw error
  return data
}

export async function fetchProductionRuns(tenantId) {
  const { data, error } = await supabase
    .from('production_runs')
    .select('*, products(name, unit), branches(name), users(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

export async function fetchProductionRunsInRange(tenantId, { startDate, endDate }) {
  const { data, error } = await supabase
    .from('production_runs')
    .select('*, products(name, unit), branches(name), users(name)')
    .eq('tenant_id', tenantId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Consumes each BOM component's stock (scaled by qty) and adds qty to the
// finished product's stock, atomically, via record_production_run(). If no
// BOM is defined for this product yet, it just adds stock — see
// manufacturing_mode.sql.
export async function recordProductionRun(tenantId, finishedProductId, qty, branchId, note) {
  const { data, error } = await supabase.rpc('record_production_run', {
    p_tenant_id: tenantId,
    p_finished_product_id: finishedProductId,
    p_qty: qty,
    p_branch_id: branchId || null,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

// ─── Pharmacy Mode: Prescription Dispensing ────────────────────────────────

export async function fetchPrescriptionDispenses(tenantId) {
  const { data, error } = await supabase
    .from('prescription_dispenses')
    .select('*, products(name), branches(name), users(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data
}

// Compliance log for one dispensed line item — separate from the order
// itself, and never blocks the sale if it fails (called best-effort after
// checkout already succeeded, same as the ZIMRA fiscal submission).
export async function recordPrescriptionDispense(tenantId, {
  branchId, orderId, productId, qty, customerId, customerName,
  prescriberName, prescriberLicenseNo, dispensingClass, controlledSchedule, userId,
}) {
  const { error } = await supabase.from('prescription_dispenses').insert({
    tenant_id: tenantId,
    branch_id: branchId || null,
    order_id: orderId || null,
    product_id: productId,
    qty,
    customer_id: customerId || null,
    customer_name: customerName || null,
    prescriber_name: prescriberName,
    prescriber_license_no: prescriberLicenseNo || null,
    dispensing_class: dispensingClass,
    controlled_schedule: controlledSchedule || null,
    created_by: userId || null,
  })
  if (error) throw error
}

// ─── Bar/Liquor Store Mode: Age Verification ───────────────────────────────

export async function fetchAgeVerifications(tenantId) {
  const { data, error } = await supabase
    .from('age_verifications')
    .select('*, products(name), branches(name), users(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data
}

// Compliance log for one age-restricted line item — separate from the order
// itself, and never blocks the sale if it fails (called best-effort after
// checkout already succeeded, same as recordPrescriptionDispense).
export async function recordAgeVerification(tenantId, {
  branchId, orderId, productId, qty, idType, idLast4, userId,
}) {
  const { error } = await supabase.from('age_verifications').insert({
    tenant_id: tenantId,
    branch_id: branchId || null,
    order_id: orderId || null,
    product_id: productId,
    qty,
    id_type: idType || null,
    id_last4: idLast4 || null,
    verified_by: userId || null,
  })
  if (error) throw error
}

export async function insertBranch(tenantId, branch) {
  const { data, error } = await supabase
    .from('branches')
    .insert({
      tenant_id: tenantId,
      name: branch.name,
      address: branch.address || null,
      phone: branch.phone || null,
      is_main: false,
      is_active: true,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBranch(id, updates) {
  const { data, error } = await supabase
    .from('branches')
    .update({
      name: updates.name,
      address: updates.address || null,
      phone: updates.phone || null,
      is_active: updates.isActive !== undefined ? updates.isActive : true,
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteBranch(id) {
  const { error } = await supabase
    .from('branches')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ─── Branch assignment (extra branches beyond a user's/product's home branch) ─

export async function fetchUserBranches(userId) {
  const { data, error } = await supabase.from('user_branches').select('branch_id').eq('user_id', userId)
  if (error) throw error
  return (data || []).map((r) => r.branch_id)
}

export async function assignUserBranch(userId, branchId) {
  const { error } = await supabase.rpc('assign_user_branch', { p_user_id: userId, p_branch_id: branchId })
  if (error) throw error
}

export async function unassignUserBranch(userId, branchId) {
  const { error } = await supabase.rpc('unassign_user_branch', { p_user_id: userId, p_branch_id: branchId })
  if (error) throw error
}

export async function fetchProductBranches(productId) {
  const { data, error } = await supabase.from('product_branches').select('branch_id').eq('product_id', productId)
  if (error) throw error
  return (data || []).map((r) => r.branch_id)
}

export async function assignProductBranch(productId, branchId) {
  const { error } = await supabase.rpc('assign_product_branch', { p_product_id: productId, p_branch_id: branchId })
  if (error) throw error
}

export async function unassignProductBranch(productId, branchId) {
  const { error } = await supabase.rpc('unassign_product_branch', { p_product_id: productId, p_branch_id: branchId })
  if (error) throw error
}

// ─── Reports metrics ──────────────────────────────────────────────────────────

// Summary cards + branch breakdown respect the selected period (defaults to
// month-to-date when no range is given); the 6-month trend chart stays a
// fixed rolling window regardless, since it's a trend, not a period total.
export async function fetchReportMetrics(tenantId, { startDate, endDate } = {}) {
  const now = new Date()
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()
  const periodStart = startDate || mtdStart
  const periodEnd = endDate || now.toISOString()

  const [mtdTx, monthlyTx, branchTx, productsSoldRes] = await Promise.all([
    // Period summary (MTD by default, or the selected range)
    supabase
      .from('transactions')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd),

    // Last 6 months, grouped by month (fetch raw, group client-side) —
    // always the rolling window, independent of the period filter
    supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('created_at', sixMonthsAgo),

    // Branch breakdown for the same period
    supabase
      .from('transactions')
      .select('amount, branches(name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd),

    // Products sold in the same period, via order_items
    supabase
      .from('order_items')
      .select('qty, orders!inner(tenant_id, created_at)')
      .eq('orders.tenant_id', tenantId)
      .gte('orders.created_at', periodStart)
      .lte('orders.created_at', periodEnd),
  ])

  const mtd = mtdTx.data ?? []
  const allTx = monthlyTx.data ?? []
  const branchRows = branchTx.data ?? []
  const itemRows = productsSoldRes.data ?? []

  const mtdRevenue = mtd.reduce((s, t) => s + parseFloat(t.amount), 0)
  const mtdOrders = mtd.length
  const avgOrderValue = mtdOrders > 0 ? mtdRevenue / mtdOrders : 0
  const productsSold = itemRows.reduce((s, r) => s + (r.qty || 0), 0)

  // Group by calendar month label
  const monthMap = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'short' })
    monthMap[key] = { month: label, revenue: 0, orders: 0 }
  }
  for (const t of allTx) {
    const d = new Date(t.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthMap[key]) {
      monthMap[key].revenue += parseFloat(t.amount)
      monthMap[key].orders += 1
    }
  }
  const monthlyData = Object.values(monthMap)

  // Branch breakdown
  const bMap = {}
  for (const r of branchRows) {
    const name = r.branches?.name || 'Unassigned'
    if (!bMap[name]) bMap[name] = { branch: name, revenue: 0, orders: 0 }
    bMap[name].revenue += parseFloat(r.amount)
    bMap[name].orders += 1
  }
  const branchData = Object.values(bMap)

  return { mtdRevenue, mtdOrders, avgOrderValue, productsSold, monthlyData, branchData }
}

// ─── AI Insights (real, per-product performance) ──────────────────────────────

export async function fetchProductPerformance(tenantId, sinceISO) {
  const [{ data: items, error }, { data: products }] = await Promise.all([
    supabase
      .from('order_items')
      .select('product_id, name, qty, total, orders!inner(tenant_id, created_at)')
      .eq('orders.tenant_id', tenantId)
      .gte('orders.created_at', sinceISO),
    supabase
      .from('products')
      .select('id, cost_price, categories(name)')
      .eq('tenant_id', tenantId),
  ])
  if (error) throw error

  const meta = {}
  ;(products || []).forEach((p) => {
    meta[p.id] = { cost: Number(p.cost_price) || 0, category: p.categories?.name || 'Uncategorised' }
  })

  const agg = {}
  ;(items || []).forEach((it) => {
    const key = it.product_id || it.name
    if (!agg[key]) {
      agg[key] = {
        name: it.name,
        category: it.product_id ? (meta[it.product_id]?.category || 'Uncategorised') : 'Uncategorised',
        sold: 0, revenue: 0, cost: 0,
      }
    }
    agg[key].sold += it.qty || 0
    agg[key].revenue += Number(it.total) || 0
    agg[key].cost += (it.product_id ? (meta[it.product_id]?.cost || 0) : 0) * (it.qty || 0)
  })
  return Object.values(agg)
}

// ─── Data export (download everything, like "download your data") ────────────

export async function fetchAllTenantData(tenantId) {
  const [products, orders, orderItems, transactions, staff, branches, tasks] = await Promise.all([
    supabase.from('products').select('*').eq('tenant_id', tenantId),
    supabase.from('orders').select('*').eq('tenant_id', tenantId),
    supabase.from('order_items').select('*, orders!inner(tenant_id)').eq('orders.tenant_id', tenantId),
    supabase.from('transactions').select('*').eq('tenant_id', tenantId),
    supabase.from('users').select('id, name, email, role, is_active, created_at').eq('tenant_id', tenantId),
    supabase.from('branches').select('*').eq('tenant_id', tenantId),
    supabase.from('tasks').select('*').eq('tenant_id', tenantId),
  ])

  return {
    exported_at: new Date().toISOString(),
    products: products.data || [],
    orders: orders.data || [],
    order_items: orderItems.data || [],
    transactions: transactions.data || [],
    staff: staff.data || [],
    branches: branches.data || [],
    tasks: tasks.data || [],
  }
}

// Raw transactions for a specific date range — used for formatted report
// exports (custom range or quick presets like "This Week", "Yesterday").
export async function fetchTransactionsInRange(tenantId, startISO, endISO) {
  const { data, error } = await supabase
    .from('transactions')
    .select('reference, amount, method, status, created_at, branches(name), orders(order_items(qty))')
    .eq('tenant_id', tenantId)
    .gte('created_at', startISO)
    .lte('created_at', endISO)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map((t) => ({
    reference: t.reference,
    date: new Date(t.created_at).toLocaleDateString('en-GB'),
    time: new Date(t.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    branch: t.branches?.name || '—',
    method: t.method,
    status: t.status,
    items: t.orders?.order_items?.reduce((s, i) => s + i.qty, 0) || 0,
    amount: parseFloat(t.amount),
  }))
}

// ─── Dashboard metrics ────────────────────────────────────────────────────────

export async function fetchDashboardMetrics(tenantId) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 6)

  const [txRes, weekTxRes, productRes, staffRes, recentRes, itemsRes] = await Promise.all([
    // Today's transactions
    supabase
      .from('transactions')
      .select('amount, method, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString()),
    // Last 7 days, for the weekly chart
    supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('created_at', weekStart.toISOString()),
    // Product count + low stock + category
    supabase
      .from('products')
      .select('id, stock_qty, low_stock_threshold, name, categories(name)')
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    // Active staff
    supabase
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    // Recent transactions (last 5)
    supabase
      .from('transactions')
      .select('reference, amount, method, created_at, orders(order_items(qty))')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5),
    // Top products this week, via order_items
    supabase
      .from('order_items')
      .select('name, qty, total, orders!inner(tenant_id, created_at)')
      .eq('orders.tenant_id', tenantId)
      .gte('orders.created_at', weekStart.toISOString()),
  ])

  const txs = txRes.data ?? []
  const weekTxs = weekTxRes.data ?? []
  const products = productRes.data ?? []
  const staff = staffRes.data ?? []
  const recent = recentRes.data ?? []
  const items = itemsRes.data ?? []

  const todayRevenue = txs.reduce((s, t) => s + parseFloat(t.amount), 0)
  const todayOrders = txs.length
  const lowStock = products.filter(p => p.stock_qty <= (p.low_stock_threshold ?? 10))

  // Weekly chart: last 7 days, aggregated from real transactions
  const weekData = []
  const dayBuckets = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart)
    d.setDate(d.getDate() - i)
    const key = d.toDateString()
    const label = d.toLocaleDateString('en-US', { weekday: 'short' })
    dayBuckets[key] = { name: label, revenue: 0, orders: 0 }
  }
  for (const t of weekTxs) {
    const key = new Date(t.created_at).toDateString()
    if (dayBuckets[key]) {
      dayBuckets[key].revenue += parseFloat(t.amount)
      dayBuckets[key].orders += 1
    }
  }
  weekData.push(...Object.values(dayBuckets))

  // Top products this week
  const productAgg = {}
  for (const it of items) {
    if (!productAgg[it.name]) productAgg[it.name] = { name: it.name, sold: 0, revenue: 0 }
    productAgg[it.name].sold += it.qty || 0
    productAgg[it.name].revenue += Number(it.total) || 0
  }
  const topProducts = Object.values(productAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  // Category breakdown, by product count (proxy for stock mix)
  const catCounts = {}
  for (const p of products) {
    const cat = p.categories?.name || 'Uncategorised'
    catCounts[cat] = (catCounts[cat] || 0) + 1
  }
  const totalCatCount = products.length || 1
  const categoryData = Object.entries(catCounts)
    .map(([name, count]) => ({ name, value: Math.round((count / totalCatCount) * 100) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  return {
    todayRevenue,
    todayOrders,
    totalProducts: products.length,
    activeStaff: staff.length,
    lowStockItems: lowStock,
    recentTransactions: recent,
    weekData,
    topProducts,
    categoryData,
  }
}

// Cashiers/shop assistants don't get the tenant-wide Dashboard (revenue
// across every till, everyone's low-stock alerts, etc. isn't theirs to
// see) -- but a personal "what did I sell" summary was requested as a
// helpful, account-scoped alternative. Same shape/queries as
// fetchDashboardMetrics above, filtered to transactions.processed_by
// instead of the whole tenant.
export async function fetchMyDashboardMetrics(tenantId, userId) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 6)

  const [txRes, weekTxRes, recentRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('tenant_id', tenantId)
      .eq('processed_by', userId)
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString()),
    supabase
      .from('transactions')
      .select('amount, created_at, order_id')
      .eq('tenant_id', tenantId)
      .eq('processed_by', userId)
      .eq('status', 'completed')
      .gte('created_at', weekStart.toISOString()),
    supabase
      .from('transactions')
      .select('reference, amount, method, created_at, orders(order_items(qty))')
      .eq('tenant_id', tenantId)
      .eq('processed_by', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const txs = txRes.data ?? []
  const weekTxs = weekTxRes.data ?? []
  const recent = recentRes.data ?? []

  const todayRevenue = txs.reduce((s, t) => s + parseFloat(t.amount), 0)
  const todayOrders = txs.length
  const weekRevenue = weekTxs.reduce((s, t) => s + parseFloat(t.amount), 0)
  const weekOrders = weekTxs.length

  const weekData = []
  const dayBuckets = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart)
    d.setDate(d.getDate() - i)
    dayBuckets[d.toDateString()] = { name: d.toLocaleDateString('en-US', { weekday: 'short' }), revenue: 0, orders: 0 }
  }
  for (const t of weekTxs) {
    const key = new Date(t.created_at).toDateString()
    if (dayBuckets[key]) {
      dayBuckets[key].revenue += parseFloat(t.amount)
      dayBuckets[key].orders += 1
    }
  }
  weekData.push(...Object.values(dayBuckets))

  const orderIds = [...new Set(weekTxs.map((t) => t.order_id).filter(Boolean))]
  let topProducts = []
  if (orderIds.length > 0) {
    const { data: items } = await supabase.from('order_items').select('name, qty, total').in('order_id', orderIds)
    const agg = {}
    for (const it of items || []) {
      if (!agg[it.name]) agg[it.name] = { name: it.name, sold: 0, revenue: 0 }
      agg[it.name].sold += it.qty || 0
      agg[it.name].revenue += Number(it.total) || 0
    }
    topProducts = Object.values(agg).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }

  return { todayRevenue, todayOrders, weekRevenue, weekOrders, weekData, topProducts, recentTransactions: recent }
}

// ─── HR & Payroll ──────────────────────────────────────────────────────────────

export async function fetchStaffPayroll(tenantId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, role, employment_type, pay_type, base_pay, is_active')
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) throw error
  return data
}

export async function updateStaffPay(userId, { employmentType, payType, basePay }) {
  const { error } = await supabase
    .from('users')
    .update({ employment_type: employmentType, pay_type: payType, base_pay: basePay, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

export async function fetchPayrollRuns(tenantId) {
  const { data, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchPayrollEntries(runId) {
  const { data, error } = await supabase
    .from('payroll_entries')
    .select('*')
    .eq('run_id', runId)
    .order('employee_name')
  if (error) throw error
  return data
}

export async function savePayrollRun(tenantId, userId, run, entries) {
  const totals = entries.reduce((acc, e) => {
    const gross = parseFloat(e.gross_pay) || 0
    const ded = (parseFloat(e.paye) || 0) + (parseFloat(e.nssa) || 0) + (parseFloat(e.other_deductions) || 0)
    return { gross: acc.gross + gross, deductions: acc.deductions + ded, net: acc.net + Math.max(0, gross - ded) }
  }, { gross: 0, deductions: 0, net: 0 })

  let runId = run.id
  if (runId) {
    const { error } = await supabase.from('payroll_runs').update({
      period_label: run.period_label, period_start: run.period_start, period_end: run.period_end,
      pay_date: run.pay_date || null, status: run.status,
      total_gross: totals.gross, total_deductions: totals.deductions, total_net: totals.net,
      employee_count: entries.length, notes: run.notes || null, updated_at: new Date().toISOString(),
    }).eq('id', runId)
    if (error) throw error
    await supabase.from('payroll_entries').delete().eq('run_id', runId)
  } else {
    const { data, error } = await supabase.from('payroll_runs').insert({
      tenant_id: tenantId, created_by: userId,
      period_label: run.period_label, period_start: run.period_start, period_end: run.period_end,
      pay_date: run.pay_date || null, status: run.status,
      total_gross: totals.gross, total_deductions: totals.deductions, total_net: totals.net,
      employee_count: entries.length, notes: run.notes || null,
    }).select().single()
    if (error) throw error
    runId = data.id
  }

  const entryRows = entries.map(e => {
    const gross = parseFloat(e.gross_pay) || 0
    const paye = parseFloat(e.paye) || 0
    const nssa = parseFloat(e.nssa) || 0
    const other = parseFloat(e.other_deductions) || 0
    return {
      tenant_id: tenantId, run_id: runId, user_id: e.user_id || null,
      employee_name: e.employee_name, employment_type: e.employment_type, pay_type: e.pay_type,
      gross_pay: gross, paye, nssa, other_deductions: other,
      net_pay: Math.max(0, gross - paye - nssa - other), notes: e.notes || null,
    }
  })
  const { error: entryError } = await supabase.from('payroll_entries').insert(entryRows)
  if (entryError) throw entryError
  return runId
}

export async function updatePayrollRunStatus(runId, status) {
  const { error } = await supabase.from('payroll_runs')
    .update({ status, updated_at: new Date().toISOString() }).eq('id', runId)
  if (error) throw error
}

export async function deletePayrollRun(runId) {
  const { error } = await supabase.from('payroll_runs').delete().eq('id', runId)
  if (error) throw error
}

// ─── Receipt configuration (branding, paper size, template mode) ──────────────

export async function fetchReceiptConfigs(tenantId) {
  const { data, error } = await supabase
    .from('receipt_configs')
    .select('*, branches(name)')
    .eq('tenant_id', tenantId)
  if (error) throw error
  return data
}

/** The config that should actually apply for a given branch right now:
 *  an approved branch-specific override if one exists, else the tenant-wide
 *  default (branch_id IS NULL), else null (caller falls back to hardcoded defaults).
 *
 *  Fetches every approved row for the tenant (not just the current branch
 *  scope) and prefers whichever is actually filled in. A session with no
 *  branch pinned (or one that briefly doesn't match) used to fall straight to
 *  the tenant-wide default row even when that row had never been configured
 *  — printing a blank/placeholder-looking receipt even though the tenant had
 *  real details saved under a specific branch. Once a tenant has configured
 *  anything, no session should ever see a blank receipt again. */
export async function fetchEffectiveReceiptConfig(tenantId, branchId) {
  const { data, error } = await supabase
    .from('receipt_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('pending_approval', false)
  if (error) throw error
  const branchRow = branchId ? data.find((r) => r.branch_id === branchId) : null
  const defaultRow = data.find((r) => r.branch_id === null)
  const populated = (row) => row?.store_name
  return (
    (populated(branchRow) && branchRow) ||
    (populated(defaultRow) && defaultRow) ||
    branchRow ||
    defaultRow ||
    data.find((r) => r.store_name) ||
    null
  )
}

export async function submitReceiptConfig(config) {
  const { data, error } = await supabase.rpc('submit_receipt_config', {
    p_branch_id: config.branchId || null,
    p_template_mode: config.templateMode || 'zimra_default',
    p_store_name: config.storeName || null,
    p_store_address: config.storeAddress || null,
    p_store_contacts: config.storeContacts || null,
    p_tin: config.tin || null,
    p_vat_number: config.vatNumber || null,
    p_footer_message: config.footerMessage || null,
    p_paper_width_mm: config.paperWidthMm || 80,
    p_printer_connection: config.printerConnection || 'usb',
    p_show_pos_print: config.showPosPrint !== false,
    p_header_message: config.headerMessage || null,
    p_custom_lines: config.customLines || [],
    p_logo_url: config.logoUrl || null,
    p_bank_details: config.bankDetails || null,
    p_com_port: config.comPort || null,
  })
  if (error) throw error
  return data
}

// Upload a business logo (for quotes/invoices/receipts) to storage; returns its public URL
export async function uploadDocumentLogo(tenantId, file) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${tenantId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from('business-logos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data } = supabase.storage.from('business-logos').getPublicUrl(path)
  return data.publicUrl
}

/** Everything currently waiting on the Vendor's decision, in one call —
 *  receipt-config drafts, void/return requests and validations, and Paynow
 *  sessions needing manual review. Powers the Requests page and the
 *  dashboard notice. */
export async function fetchVendorRequests(tenantId) {
  const [configs, voids, returns, sessions, configChanges] = await Promise.all([
    fetchReceiptConfigs(tenantId).catch(() => []),
    fetchVoids(tenantId).catch(() => []),
    fetchReturns(tenantId).catch(() => []),
    fetchPaymentSessions(tenantId).catch(() => []),
    fetchPendingConfigChanges(tenantId).catch(() => []),
  ])
  const result = {
    receiptConfigs: (configs || []).filter((c) => c.pending_approval),
    voids: (voids || []).filter((v) => ['requested', 'approved'].includes(v.status)),
    returns: (returns || []).filter((r) => ['requested', 'approved'].includes(r.status)),
    payments: (sessions || []).filter((s) => ['pending', 'awaiting_delivery'].includes(s.status)),
    configChanges: (configChanges || []).filter((c) => c.status === 'pending'),
  }
  result.total = result.receiptConfigs.length + result.voids.length + result.returns.length + result.payments.length + result.configChanges.length
  return result
}

export async function approveReceiptConfig(configId) {
  const { error } = await supabase.rpc('approve_receipt_config', { p_config_id: configId })
  if (error) throw error
}

export async function rejectReceiptConfig(configId) {
  const { error } = await supabase.rpc('reject_receipt_config', { p_config_id: configId })
  if (error) throw error
}

// ─── Shop Manager config-change approval ───────────────────────────────────────

export async function submitConfigChange(tenantId, branchId, configArea, receiptBranchId, newValues) {
  const { data, error } = await supabase.rpc('submit_config_change', {
    p_tenant_id: tenantId,
    p_branch_id: branchId || null,
    p_config_area: configArea,
    p_receipt_branch_id: receiptBranchId || null,
    p_new_values: newValues,
  })
  if (error) throw error
  return data
}

export async function fetchPendingConfigChanges(tenantId) {
  const { data, error } = await supabase
    .from('pending_config_changes')
    .select('*, submitter:users!pending_config_changes_changed_by_fkey(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function approveConfigChange(id) {
  const { error } = await supabase.rpc('approve_config_change', { p_id: id })
  if (error) throw error
}

export async function rejectConfigChange(id) {
  const { error } = await supabase.rpc('reject_config_change', { p_id: id })
  if (error) throw error
}

// ─── Staff shifts (shop manager: working hours & rotations) ───────────────────

export async function fetchShifts(tenantId, { fromDate, toDate } = {}) {
  let query = supabase
    .from('staff_shifts')
    .select('*, users(name, role)')
    .eq('tenant_id', tenantId)
    .order('shift_date', { ascending: true })
    .order('start_time', { ascending: true })
  if (fromDate) query = query.gte('shift_date', fromDate)
  if (toDate) query = query.lte('shift_date', toDate)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function insertShift(tenantId, branchId, shift) {
  const { data, error } = await supabase
    .from('staff_shifts')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId || null,
      user_id: shift.userId,
      shift_date: shift.shiftDate,
      start_time: shift.startTime,
      end_time: shift.endTime,
      notes: shift.notes || null,
      created_by: shift.createdBy || null,
    })
    .select('*, users(name, role)')
    .single()
  if (error) throw error
  return data
}

export async function deleteShift(shiftId) {
  const { error } = await supabase.from('staff_shifts').delete().eq('id', shiftId)
  if (error) throw error
}

// ─── Documents (quotations & invoices) ─────────────────────────────────────────

export async function fetchDocuments(tenantId, docType) {
  // users(name) powers "Prepared By" on the generated PDF (invoicePdf.js)
  let query = supabase
    .from('documents')
    .select('*, users(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  if (docType) query = query.eq('doc_type', docType)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function insertDocument(tenantId, branchId, userId, doc) {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId || null,
      doc_type: doc.docType,
      doc_number: doc.docNumber,
      status: doc.status || 'draft',
      customer_id: doc.customerId || null,
      customer_name: doc.customerName,
      customer_email: doc.customerEmail || null,
      customer_phone: doc.customerPhone || null,
      customer_address: doc.customerAddress || null,
      items: doc.items || [],
      subtotal: doc.subtotal,
      vat_amount: doc.vatAmount,
      vat_enabled: doc.vatEnabled !== false,
      total: doc.total,
      notes: doc.notes || null,
      valid_until: doc.validUntil || null,
      due_date: doc.dueDate || null,
      converted_from_id: doc.convertedFromId || null,
      created_by: userId || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Turns a job card's diagnosis + billable items into a real quotation the
// customer can be sent -- the other direction of the Quotation -> Job Card
// flow in Invoicing.jsx/Quotations.jsx. Links back via job_cards.quotation_id
// (same column, whichever direction created the link).
export async function createQuotationFromJobCard(tenantId, branchId, userId, jobCard, { vatEnabled = true, vatRate = 15.5 } = {}) {
  const items = (jobCard.items || []).map((i) => ({ description: i.description, qty: i.qty, unit_price: i.unit_price, discount_pct: 0 }))
  const grossTotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0)
  const vatAmount = vatEnabled ? grossTotal * (vatRate / (100 + vatRate)) : 0
  const doc = await insertDocument(tenantId, branchId, userId, {
    docType: 'quotation',
    docNumber: generateDocNumber('QUO'),
    status: 'draft',
    customerName: jobCard.customers?.name || 'Customer',
    customerPhone: jobCard.customers?.phone || null,
    items,
    subtotal: grossTotal - vatAmount,
    vatAmount,
    vatEnabled,
    total: grossTotal,
    notes: jobCard.diagnosis || null,
  })
  await supabase.from('job_cards').update({ quotation_id: doc.id }).eq('id', jobCard.id)
  return doc
}

export async function updateDocument(id, updates) {
  const { data, error } = await supabase
    .from('documents')
    .update({
      status: updates.status,
      customer_id: updates.customerId || null,
      customer_name: updates.customerName,
      customer_email: updates.customerEmail || null,
      customer_phone: updates.customerPhone || null,
      customer_address: updates.customerAddress || null,
      items: updates.items || [],
      subtotal: updates.subtotal,
      vat_amount: updates.vatAmount,
      vat_enabled: updates.vatEnabled !== false,
      total: updates.total,
      notes: updates.notes || null,
      valid_until: updates.validUntil || null,
      due_date: updates.dueDate || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDocument(id) {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
}

export async function recordInvoicePayment(documentId, { amount, method, paidAt, note }) {
  const { data, error } = await supabase.rpc('record_invoice_payment', {
    p_document_id: documentId,
    p_amount: amount,
    p_method: method,
    p_paid_at: paidAt || new Date().toISOString(),
    p_note: note || null,
  })
  if (error) throw error
  return data
}

export async function voidInvoicePayment(paymentId) {
  const { error } = await supabase.rpc('void_invoice_payment', { p_payment_id: paymentId })
  if (error) throw error
}

export async function fetchInvoicePayments(documentId) {
  const { data, error } = await supabase
    .from('invoice_payments')
    .select('*, users(name)')
    .eq('document_id', documentId)
    .order('paid_at', { ascending: false })
  if (error) throw error
  return data
}

// Every non-voided invoice_payments row for the tenant -- used by the
// Debtors overview to compute outstanding balances per customer without a
// per-customer round trip (see fetchCustomerStatement for the single-
// customer version).
export async function fetchAllInvoicePaymentsForTenant(tenantId) {
  const { data, error } = await supabase
    .from('invoice_payments')
    .select('document_id, amount')
    .eq('tenant_id', tenantId)
    .is('voided_at', null)
  if (error) throw error
  return data
}

// All invoices for one customer, plus every payment against them, for the
// Statements page's running balance -- two queries instead of a view/RPC,
// matching this codebase's usual "aggregate in JS" style (see Reports.jsx).
export async function fetchCustomerStatement(tenantId, customerId) {
  const { data: documents, error: docErr } = await supabase
    .from('documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .eq('doc_type', 'invoice')
    .order('created_at', { ascending: true })
  if (docErr) throw docErr

  const ids = (documents || []).map((d) => d.id)
  if (ids.length === 0) return { documents: [], payments: [] }

  const { data: payments, error: payErr } = await supabase
    .from('invoice_payments')
    .select('*')
    .in('document_id', ids)
    .is('voided_at', null)
  if (payErr) throw payErr

  return { documents, payments: payments || [] }
}

/** Converts an accepted quotation into a new invoice, copying customer/items
 *  across and linking the two records both ways. */
export async function convertQuotationToInvoice(quotation, docNumber, userId) {
  const { data: invoice, error } = await supabase
    .from('documents')
    .insert({
      tenant_id: quotation.tenant_id,
      branch_id: quotation.branch_id,
      doc_type: 'invoice',
      doc_number: docNumber,
      status: 'draft',
      customer_id: quotation.customer_id,
      customer_name: quotation.customer_name,
      customer_email: quotation.customer_email,
      customer_phone: quotation.customer_phone,
      customer_address: quotation.customer_address,
      items: quotation.items,
      subtotal: quotation.subtotal,
      vat_amount: quotation.vat_amount,
      vat_enabled: quotation.vat_enabled !== false,
      total: quotation.total,
      notes: quotation.notes,
      converted_from_id: quotation.id,
      created_by: userId || null,
    })
    .select()
    .single()
  if (error) throw error

  const { error: updateErr } = await supabase
    .from('documents')
    .update({ status: 'accepted', converted_to_id: invoice.id, updated_at: new Date().toISOString() })
    .eq('id', quotation.id)
  if (updateErr) throw updateErr

  return invoice
}

// ─── Workshop Mode: Customers, Vehicles, Job Cards ────────────────────────────

export async function fetchCustomers(tenantId) {
  const { data, error } = await supabase
    .from('customers')
    .select('*, vehicles(*)')
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .order('name')
  if (error) throw error
  return data
}

export async function createCustomer(tenantId, { name, phone, email, address, notes }) {
  const { data, error } = await supabase
    .from('customers')
    .insert({ tenant_id: tenantId, name, phone: phone || null, email: email || null, address: address || null, notes: notes || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCustomer(id, { name, phone, email, address, notes }) {
  const { data, error } = await supabase
    .from('customers')
    .update({ name, phone: phone || null, email: email || null, address: address || null, notes: notes || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteCustomer(id) {
  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Best-effort: reuse an existing customer (matched by phone, then by exact
// name) so repeat customers build up one real record instead of a fresh
// free-text entry every time a quote/invoice is made out to them — used by
// Invoicing.jsx, which (unlike Job Cards) doesn't force an explicit
// select-or-create choice. Never throws; a failure here shouldn't block
// saving the document itself.
export async function findOrCreateCustomer(tenantId, { name, phone, email, address }) {
  try {
    if (phone?.trim()) {
      const { data: byPhone } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).eq('phone', phone.trim()).maybeSingle()
      if (byPhone) {
        await supabase.from('customers').update({ name, email: email || null, address: address || null, updated_at: new Date().toISOString() }).eq('id', byPhone.id)
        return byPhone.id
      }
    } else if (name?.trim()) {
      const { data: byName } = await supabase.from('customers').select('id').eq('tenant_id', tenantId).eq('name', name.trim()).maybeSingle()
      if (byName) return byName.id
    }
    const created = await createCustomer(tenantId, { name, phone, email, address })
    return created.id
  } catch {
    return null
  }
}

export async function createVehicle(tenantId, customerId, { make, model, year, regNumber, color }) {
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      tenant_id: tenantId, customer_id: customerId,
      make: make || null, model: model || null, year: year || null,
      reg_number: regNumber || null, color: color || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function fetchJobCards(tenantId) {
  const { data, error } = await supabase
    .from('job_cards')
    .select('*, customers(name, phone), vehicles(make, model, year, reg_number), technicians(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw error
  return data
}

export async function createJobCard(tenantId, { branchId, customerId, vehicleId, description, mileageIn, diagnosis, partsRequested, items, assignedTo, createdBy, quotationId }) {
  // job_card_no is assigned server-side (trg_set_job_card_no), a real atomic
  // per-tenant counter, so numbers are strictly increasing and never collide.
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const { data, error } = await supabase
    .from('job_cards')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId || null,
      customer_id: customerId,
      vehicle_id: vehicleId,
      description: description || null,
      mileage_in: mileageIn || null,
      diagnosis: diagnosis || null,
      parts_requested: partsRequested || [],
      items,
      subtotal,
      total: subtotal,
      assigned_to: assignedTo || null,
      created_by: createdBy || null,
      quotation_id: quotationId || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── Technicians (Workshop Mode master data — never log in) ───────────────────

export async function fetchTechnicians(tenantId) {
  const { data, error } = await supabase
    .from('technicians')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name')
  if (error) throw error
  return data
}

export async function createTechnician(tenantId, { name, phone, specialty }) {
  const { data, error } = await supabase
    .from('technicians')
    .insert({ tenant_id: tenantId, name, phone: phone || null, specialty: specialty || null })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTechnician(id, updates) {
  const { error } = await supabase.from('technicians').update(updates).eq('id', id)
  if (error) throw error
}

// ─── Duplicate detection (Workshop Mode customer/vehicle intake) ──────────────

export async function findDuplicateCustomer(tenantId, phone) {
  if (!phone?.trim()) return null
  const { data, error } = await supabase
    .from('customers')
    .select('*, vehicles(*)')
    .eq('tenant_id', tenantId)
    .eq('phone', phone.trim())
    .maybeSingle()
  if (error) throw error
  return data
}

export async function findDuplicateVehicle(tenantId, regNumber) {
  if (!regNumber?.trim()) return null
  const { data, error } = await supabase
    .from('vehicles')
    .select('*, customers(name, phone)')
    .eq('tenant_id', tenantId)
    .ilike('reg_number', regNumber.trim())
    .maybeSingle()
  if (error) throw error
  return data
}


export async function updateJobCard(jobCardId, updates) {
  const { error } = await supabase.from('job_cards').update(updates).eq('id', jobCardId)
  if (error) throw error
}

export async function deleteJobCard(jobCardId) {
  const { error } = await supabase.from('job_cards').delete().eq('id', jobCardId)
  if (error) throw error
}

// Called right after a job card's items have been paid out through the
// normal POS checkout (process_checkout) -- stamps the job card as done and
// links it to the resulting order, so its full history (what was done, on
// which vehicle, for how much) shows up in Vehicle Registry.
export async function completeJobCard(jobCardId, orderId) {
  const { error } = await supabase
    .from('job_cards')
    .update({ status: 'completed', completed_at: new Date().toISOString(), linked_order_id: orderId })
    .eq('id', jobCardId)
  if (error) throw error
}

// ─── Accounting & ERP: Suppliers ───────────────────────────────────────────

export async function fetchSuppliers(tenantId) {
  const { data, error } = await supabase.from('suppliers').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('name')
  if (error) throw error
  return data
}
export async function createSupplier(tenantId, { name, phone, email, address, notes }) {
  const { data, error } = await supabase.from('suppliers').insert({ tenant_id: tenantId, name, phone: phone || null, email: email || null, address: address || null, notes: notes || null }).select().single()
  if (error) throw error
  return data
}
export async function updateSupplier(id, { name, phone, email, address, notes }) {
  const { data, error } = await supabase.from('suppliers').update({ name, phone: phone || null, email: email || null, address: address || null, notes: notes || null, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteSupplier(id) {
  const { error } = await supabase.from('suppliers').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ─── Accounting & ERP: Fixed Assets ────────────────────────────────────────

export async function fetchFixedAssets(tenantId) {
  const { data, error } = await supabase.from('fixed_assets').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createFixedAsset(tenantId, userId, asset) {
  const { data, error } = await supabase.from('fixed_assets').insert({
    tenant_id: tenantId, branch_id: asset.branchId || null, name: asset.name, category: asset.category || null,
    asset_type: asset.assetType || 'fixed', purchase_date: asset.purchaseDate, cost: asset.cost,
    salvage_value: asset.salvageValue || 0, useful_life_years: asset.usefulLifeYears,
    custodian: asset.custodian || null, location: asset.location || null, notes: asset.notes || null, created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}
export async function updateFixedAsset(id, asset) {
  const { data, error } = await supabase.from('fixed_assets').update({
    name: asset.name, category: asset.category || null, asset_type: asset.assetType || 'fixed',
    purchase_date: asset.purchaseDate, cost: asset.cost, salvage_value: asset.salvageValue || 0,
    useful_life_years: asset.usefulLifeYears, custodian: asset.custodian || null, location: asset.location || null,
    notes: asset.notes || null, disposed_at: asset.disposedAt || null, disposal_value: asset.disposalValue ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteFixedAsset(id) {
  const { error } = await supabase.from('fixed_assets').delete().eq('id', id)
  if (error) throw error
}

// ─── Accounting & ERP: Expenses ────────────────────────────────────────────

// expense_date is a plain DATE column (no time/timezone) -- callers pass
// fromDate/toDate as full UTC ISO timestamps (e.g. range.start.toISOString()
// for a "Today" preset). Handing that straight to a `date` column's
// .gte()/.lte() makes Postgres cast the string to date by truncating the
// literal UTC text, NOT by converting to local time first -- confirmed live:
// '2026-08-03T22:00:00.000Z'::date = '2026-08-03', even though that instant
// is already Aug 4th in Harare (UTC+2). For a tenant east of UTC, "Today"'s
// start-of-day boundary silently lands on the wrong (previous) calendar
// date, pulling all of yesterday's expenses into today's report. Recover
// the correct local calendar date instead, in the same browser session/
// timezone the ISO string was created in.
function toLocalDateStr(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function fetchExpenses(tenantId, { fromDate, toDate } = {}) {
  let q = supabase.from('expenses').select('*, suppliers(name)').eq('tenant_id', tenantId).order('expense_date', { ascending: false })
  if (fromDate) q = q.gte('expense_date', toLocalDateStr(fromDate))
  if (toDate) q = q.lte('expense_date', toLocalDateStr(toDate))
  const { data, error } = await q
  if (error) throw error
  return data
}
export async function createExpense(tenantId, userId, expense) {
  const { data, error } = await supabase.from('expenses').insert({
    tenant_id: tenantId, branch_id: expense.branchId || null, expense_date: expense.date, category: expense.category,
    description: expense.description || null, amount: expense.amount, payment_method: expense.paymentMethod || null,
    supplier_id: expense.supplierId || null, created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}
export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

// ─── Accounting & ERP: Petty Cash ──────────────────────────────────────────

export async function fetchPettyCashTransactions(tenantId, { fromDate, toDate } = {}) {
  let q = supabase.from('petty_cash_transactions').select('*, users(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (fromDate) q = q.gte('created_at', fromDate)
  if (toDate) q = q.lte('created_at', toDate)
  const { data, error } = await q
  if (error) throw error
  return data
}
export async function createPettyCashTransaction(tenantId, userId, { branchId, type, amount, description }) {
  const { data, error } = await supabase.from('petty_cash_transactions').insert({
    tenant_id: tenantId, branch_id: branchId || null, type, amount, description: description || null, created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}

// ─── Accounting & ERP: Cash Management (Cash at Hand / Cash at Bank) ──────

export async function fetchCashTransactions(tenantId, { fromDate, toDate } = {}) {
  let q = supabase.from('cash_transactions').select('*, users(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (fromDate) q = q.gte('created_at', fromDate)
  if (toDate) q = q.lte('created_at', toDate)
  const { data, error } = await q
  if (error) throw error
  return data
}
export async function createCashTransaction(tenantId, userId, { branchId, account, type, toAccount, amount, description }) {
  const { data, error } = await supabase.from('cash_transactions').insert({
    tenant_id: tenantId, branch_id: branchId || null, account, type, to_account: type === 'transfer' ? toAccount : null,
    amount, description: description || null, created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}

// ─── Accounting & ERP: Requisitions ────────────────────────────────────────

export async function fetchRequisitions(tenantId) {
  const { data, error } = await supabase.from('requisitions').select('*, requester:users!requisitions_requested_by_fkey(name), approver:users!requisitions_approved_by_fkey(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createRequisition(tenantId, userId, { branchId, purpose, amountRequested, notes }) {
  const { data, error } = await supabase.from('requisitions').insert({
    tenant_id: tenantId, branch_id: branchId || null, requested_by: userId || null, purpose, amount_requested: amountRequested, notes: notes || null,
  }).select().single()
  if (error) throw error
  return data
}
export async function updateRequisitionStatus(id, status, approvedBy) {
  const updates = { status, updated_at: new Date().toISOString() }
  if (['approved', 'rejected'].includes(status)) { updates.approved_by = approvedBy; updates.approved_at = new Date().toISOString() }
  const { data, error } = await supabase.from('requisitions').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ─── Accounting & ERP: Creditors (Accounts Payable) ────────────────────────

export async function fetchCreditorBills(tenantId) {
  const { data, error } = await supabase.from('creditor_bills').select('*, suppliers(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createCreditorBill(tenantId, userId, { supplierId, billNumber, description, amount, dueDate }) {
  const { data, error } = await supabase.from('creditor_bills').insert({
    tenant_id: tenantId, supplier_id: supplierId || null, bill_number: billNumber || null, description: description || null,
    amount, due_date: dueDate || null, created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}
export async function fetchCreditorPayments(creditorBillId) {
  const { data, error } = await supabase.from('creditor_payments').select('*, users(name)').eq('creditor_bill_id', creditorBillId).order('paid_at', { ascending: false })
  if (error) throw error
  return data
}

// Every non-voided creditor_payments row for the tenant, one request instead
// of one-per-bill -- used by Financial Reports/Balance Sheet to total
// outstanding creditor balances without an N+1 fan-out as the bill count
// grows (see fetchAllInvoicePaymentsForTenant for the debtors equivalent).
export async function fetchAllCreditorPaymentsForTenant(tenantId) {
  const { data, error } = await supabase
    .from('creditor_payments')
    .select('creditor_bill_id, amount')
    .eq('tenant_id', tenantId)
    .is('voided_at', null)
  if (error) throw error
  return data
}
export async function recordCreditorPayment(creditorBillId, { amount, method, paidAt, note }) {
  const { data, error } = await supabase.rpc('record_creditor_payment', {
    p_creditor_bill_id: creditorBillId, p_amount: amount, p_method: method, p_paid_at: paidAt || new Date().toISOString(), p_note: note || null,
  })
  if (error) throw error
  return data
}
export async function voidCreditorPayment(paymentId) {
  const { error } = await supabase.rpc('void_creditor_payment', { p_payment_id: paymentId })
  if (error) throw error
}

// ─── Accounting & ERP: Debtors (Accounts Receivable) ───────────────────────

export async function fetchManualDebtorEntries(tenantId) {
  const { data, error } = await supabase.from('manual_debtor_entries').select('*, customers(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createManualDebtorEntry(tenantId, userId, { customerId, description, amount, dueDate }) {
  const { data, error } = await supabase.from('manual_debtor_entries').insert({
    tenant_id: tenantId, customer_id: customerId || null, description, amount, due_date: dueDate || null, created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}
export async function updateManualDebtorEntryStatus(id, status) {
  const { error } = await supabase.from('manual_debtor_entries').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ─── Accounting & ERP: Credit / Debit Notes ────────────────────────────────

export async function fetchCreditDebitNotes(tenantId) {
  const { data, error } = await supabase.from('credit_debit_notes').select('*, customers(name), suppliers(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createCreditDebitNote(tenantId, userId, note) {
  const { data, error } = await supabase.from('credit_debit_notes').insert({
    tenant_id: tenantId, note_type: note.noteType, party_type: note.partyType,
    customer_id: note.partyType === 'customer' ? note.partyId || null : null,
    supplier_id: note.partyType === 'supplier' ? note.partyId || null : null,
    reference_document_id: note.referenceDocumentId || null, note_number: note.noteNumber || null,
    reason: note.reason || null, amount: note.amount, created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}

// ─── Accounting & ERP: Bill of Quantities ──────────────────────────────────

export async function fetchBoqDocuments(tenantId) {
  const { data, error } = await supabase.from('boq_documents').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createBoqDocument(tenantId, userId, boq) {
  const { data, error } = await supabase.from('boq_documents').insert({
    tenant_id: tenantId, boq_number: boq.boqNumber || null, title: boq.title, client_name: boq.clientName || null,
    items: boq.items || [], total: boq.total || 0, notes: boq.notes || null, created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}
export async function updateBoqDocument(id, boq) {
  const { data, error } = await supabase.from('boq_documents').update({
    boq_number: boq.boqNumber || null, title: boq.title, client_name: boq.clientName || null,
    items: boq.items || [], total: boq.total || 0, notes: boq.notes || null, status: boq.status || 'draft',
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single()
  if (error) throw error
  return data
}
export async function deleteBoqDocument(id) {
  const { error } = await supabase.from('boq_documents').delete().eq('id', id)
  if (error) throw error
}

// ─── Accounting & ERP: Release Notes ───────────────────────────────────────

export async function fetchReleaseNotes(tenantId) {
  const { data, error } = await supabase.from('release_notes').select('*, customers(name), users(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createReleaseNote(tenantId, userId, note) {
  const { data, error } = await supabase.from('release_notes').insert({
    tenant_id: tenantId, release_number: note.releaseNumber || null, customer_id: note.customerId || null,
    issued_to: note.issuedTo || null, items: note.items || [], notes: note.notes || null,
    status: note.status || 'draft', issued_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}

// ─── Accounting & ERP: Bank Reconciliation ─────────────────────────────────

export async function fetchBankReconciliations(tenantId) {
  const { data, error } = await supabase.from('bank_reconciliations').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createBankReconciliation(tenantId, userId, { branchId, statementStartDate, statementEndDate, statementClosingBalance }) {
  const { data, error } = await supabase.from('bank_reconciliations').insert({
    tenant_id: tenantId, branch_id: branchId || null, statement_start_date: statementStartDate,
    statement_end_date: statementEndDate, statement_closing_balance: statementClosingBalance, created_by: userId || null,
  }).select().single()
  if (error) throw error
  return data
}
export async function fetchBankStatementLines(reconciliationId) {
  const { data, error } = await supabase.from('bank_statement_lines').select('*').eq('reconciliation_id', reconciliationId).order('line_date')
  if (error) throw error
  return data
}
export async function addBankStatementLine(tenantId, reconciliationId, { lineDate, description, amount }) {
  const { data, error } = await supabase.from('bank_statement_lines').insert({
    tenant_id: tenantId, reconciliation_id: reconciliationId, line_date: lineDate, description: description || null, amount,
  }).select().single()
  if (error) throw error
  return data
}
export async function matchBankStatementLine(lineId, cashTransactionId) {
  const { error } = await supabase.from('bank_statement_lines').update({ matched: true, matched_cash_transaction_id: cashTransactionId }).eq('id', lineId)
  if (error) throw error
}
export async function unmatchBankStatementLine(lineId) {
  const { error } = await supabase.from('bank_statement_lines').update({ matched: false, matched_cash_transaction_id: null }).eq('id', lineId)
  if (error) throw error
}

// ─── Accounting & ERP: Balance Sheet support (Other Liabilities / Equity) ──

export async function fetchOtherLiabilities(tenantId) {
  const { data, error } = await supabase.from('other_liabilities').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createOtherLiability(tenantId, userId, { description, amount }) {
  const { data, error } = await supabase.from('other_liabilities').insert({ tenant_id: tenantId, description, amount, created_by: userId || null }).select().single()
  if (error) throw error
  return data
}
export async function deleteOtherLiability(id) {
  const { error } = await supabase.from('other_liabilities').delete().eq('id', id)
  if (error) throw error
}
export async function fetchEquityEntries(tenantId) {
  const { data, error } = await supabase.from('equity_entries').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
export async function createEquityEntry(tenantId, userId, { description, amount }) {
  const { data, error } = await supabase.from('equity_entries').insert({ tenant_id: tenantId, description, amount, created_by: userId || null }).select().single()
  if (error) throw error
  return data
}
export async function deleteEquityEntry(id) {
  const { error } = await supabase.from('equity_entries').delete().eq('id', id)
  if (error) throw error
}
