import { supabase } from '@/lib/supabase'
import { generateReceiptNumber } from '@/utils/formatters'

// Parses a price input into an exact 2-decimal number. Guards against any
// upstream float artifact (browser input quirks, a CSV/Excel export like
// 9.999999999999998) ever reaching the database as anything other than
// exactly what the user typed — money is never left to raw parseFloat.
function parseMoney(value) {
  const n = parseFloat(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function fetchProducts(tenantId) {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, color)')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name')
  if (error) throw error
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
      price: parseMoney(product.price),
      // landing price (what it cost you) — powers margins & AI insights
      cost_price: product.landingPrice ? parseMoney(product.landingPrice)
        : product.costPrice ? parseMoney(product.costPrice) : null,
      stock_qty: parseInt(product.stock) || 0,
      low_stock_threshold: parseInt(product.lowStockThreshold) || 10,
      unit: product.unit || null,
      image_url: product.imageUrl || null,
      image_unavailable: product.imageUnavailable === true,
      vat_treatment: product.vatTreatment || 'standard',
      attributes: product.attributes || {},
      branch_id: product.branchId || null,
      is_active: true,
      pos_visible: true,
    })
    .select()
    .single()
  if (error) throw error
  return { ...data, stock: data.stock_qty ?? 0, category: '', barcode: data.barcode ?? '', image: data.image_url ?? null }
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products')
    .update({
      name: updates.name,
      brand: updates.brand || null,
      sku: updates.sku || null,
      barcode: updates.barcode || null,
      price: parseMoney(updates.price),
      cost_price: updates.landingPrice ? parseMoney(updates.landingPrice) : null,
      stock_qty: parseInt(updates.stock) || 0,
      low_stock_threshold: parseInt(updates.lowStockThreshold) || 10,
      image_url: updates.imageUrl || null,
      image_unavailable: updates.imageUnavailable === true,
      vat_treatment: updates.vatTreatment || 'standard',
      attributes: updates.attributes || {},
      branch_id: updates.branchId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return { ...data, stock: data.stock_qty ?? 0, image: data.image_url ?? null }
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

export async function saveCheckout({ tenantId, branchId, userId, cartItems, paymentMethod, subtotal, tax, total, posMode, orderType, receiptNo: receiptNoIn, salespersonName, salespersonEmployeeNo }) {
  // The receipt number is the idempotency key: the caller generates it once,
  // up front, and reuses the SAME value on every retry (a live retry queued
  // after a network blip, or an offline-sync replay). process_checkout runs
  // the stock reservation + order + order_items + transaction as one atomic,
  // idempotent call — if this exact receipt was already processed, it
  // returns that order instead of reprocessing it. Without this, a retry
  // used to decrement stock again and create a fully duplicate sale, because
  // the old code generated a fresh receipt number on every call.
  const receiptNo = receiptNoIn || generateReceiptNumber()

  const grossTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discountAmount = Math.max(0, grossTotal - total)

  const items = cartItems.map(item => ({
    product_id: item.id && !String(item.id).startsWith('demo') ? item.id : null,
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
  })
  if (error) {
    throw new Error(error.message?.includes('Insufficient stock')
      ? error.message
      : `Checkout failed: ${error.message}`)
  }

  return { order: { id: data.order_id }, receiptNo: data.receipt_no }
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
    .select('*, order_items(*), users(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.posMode) q = q.eq('pos_mode', filters.posMode)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.notStatus) q = q.neq('status', filters.notStatus)

  const { data, error } = await q
  if (error) throw error
  return data
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function fetchTransactions(tenantId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*, orders(order_no, subtotal, tax_amount, total, order_items(qty)), users(name), branches(name)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return data
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

export async function validateReturn(returnId) {
  const { error } = await supabase.rpc('validate_return', { p_return_id: returnId })
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

// ─── Staff ────────────────────────────────────────────────────────────────────

export async function fetchStaff(tenantId) {
  // users has no branch_id FK — embedding branches() breaks PostgREST
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('tenant_id', tenantId)
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
  })
  if (error) throw error
  return data
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
  let query = supabase
    .from('documents')
    .select('*')
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
      customer_name: doc.customerName,
      customer_email: doc.customerEmail || null,
      customer_phone: doc.customerPhone || null,
      customer_address: doc.customerAddress || null,
      items: doc.items || [],
      subtotal: doc.subtotal,
      vat_amount: doc.vatAmount,
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

export async function updateDocument(id, updates) {
  const { data, error } = await supabase
    .from('documents')
    .update({
      status: updates.status,
      customer_name: updates.customerName,
      customer_email: updates.customerEmail || null,
      customer_phone: updates.customerPhone || null,
      customer_address: updates.customerAddress || null,
      items: updates.items || [],
      subtotal: updates.subtotal,
      vat_amount: updates.vatAmount,
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
      customer_name: quotation.customer_name,
      customer_email: quotation.customer_email,
      customer_phone: quotation.customer_phone,
      customer_address: quotation.customer_address,
      items: quotation.items,
      subtotal: quotation.subtotal,
      vat_amount: quotation.vat_amount,
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
