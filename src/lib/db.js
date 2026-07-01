import { supabase } from '@/lib/supabase'
import { generateReceiptNumber } from '@/utils/formatters'

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
  }))
}

export async function insertProduct(tenantId, product) {
  const { data, error } = await supabase
    .from('products')
    .insert({
      tenant_id: tenantId,
      name: product.name,
      sku: product.sku || null,
      barcode: product.barcode || null,
      price: parseFloat(product.price),
      cost_price: product.costPrice ? parseFloat(product.costPrice) : null,
      stock_qty: parseInt(product.stock) || 0,
      low_stock_threshold: parseInt(product.lowStockThreshold) || 10,
      unit: product.unit || null,
      is_active: true,
      pos_visible: true,
    })
    .select()
    .single()
  if (error) throw error
  return { ...data, stock: data.stock_qty ?? 0, category: '', barcode: data.barcode ?? '' }
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from('products')
    .update({
      name: updates.name,
      sku: updates.sku || null,
      barcode: updates.barcode || null,
      price: parseFloat(updates.price),
      stock_qty: parseInt(updates.stock) || 0,
      low_stock_threshold: parseInt(updates.lowStockThreshold) || 10,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return { ...data, stock: data.stock_qty ?? 0 }
}

export async function deleteProduct(id) {
  const { error } = await supabase
    .from('products')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// ─── Checkout / POS ──────────────────────────────────────────────────────────

export async function saveCheckout({ tenantId, branchId, userId, cartItems, paymentMethod, subtotal, tax, total, posMode, orderType }) {
  const receiptNo = generateReceiptNumber()

  // 1. Create order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      tenant_id: tenantId,
      branch_id: branchId || null,
      served_by: userId || null,
      order_no: receiptNo,
      status: posMode === 'restaurant' ? 'received' : 'completed',
      type: orderType || 'sale',
      pos_mode: posMode || 'retail',
      subtotal,
      tax_amount: tax,
      total,
    })
    .select()
    .single()
  if (orderError) throw orderError

  // 2. Create order items
  const items = cartItems.map(item => ({
    order_id: order.id,
    product_id: item.id && !String(item.id).startsWith('demo') ? item.id : null,
    name: item.name,
    sku: item.sku || null,
    qty: item.quantity,
    unit_price: item.price,
    total: item.price * item.quantity,
  }))
  const { error: itemsError } = await supabase.from('order_items').insert(items)
  if (itemsError) throw itemsError

  // 3. Create transaction (payment record)
  const { error: txError } = await supabase
    .from('transactions')
    .insert({
      tenant_id: tenantId,
      order_id: order.id,
      branch_id: branchId || null,
      processed_by: userId || null,
      type: 'sale',
      method: paymentMethod || 'cash',
      amount: total,
      reference: receiptNo,
      status: 'completed',
    })
  if (txError) throw txError

  // 4. Decrement stock (fire-and-forget — never blocks checkout)
  for (const item of cartItems) {
    const pid = item.id
    if (pid && typeof pid === 'string' && pid.length === 36) {
      supabase.from('products').select('stock_qty').eq('id', pid).single()
        .then(({ data }) => {
          if (data) {
            supabase.from('products')
              .update({ stock_qty: Math.max(0, (data.stock_qty ?? 0) - item.quantity), updated_at: new Date().toISOString() })
              .eq('id', pid)
              .then(() => {})
          }
        })
    }
  }

  return { order, receiptNo }
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
  const { data, error } = await supabase
    .from('users')
    .select('*, branches(name)')
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

// ─── Tasks ────────────────────────────────────────────────────────────────────

export async function fetchTasks(tenantId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, users!tasks_assigned_to_fkey(name, role), users!tasks_created_by_fkey(name)')
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
    .select('*, users!tasks_assigned_to_fkey(name, role)')
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

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function fetchBranches(tenantId) {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('tenant_id', tenantId)
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
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw error
}

// ─── Reports metrics ──────────────────────────────────────────────────────────

export async function fetchReportMetrics(tenantId) {
  const now = new Date()
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

  const [mtdTx, monthlyTx, branchTx, productsSoldRes] = await Promise.all([
    // MTD summary
    supabase
      .from('transactions')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('created_at', mtdStart),

    // Last 6 months, grouped by month (fetch raw, group client-side)
    supabase
      .from('transactions')
      .select('amount, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('created_at', sixMonthsAgo),

    // Branch breakdown this month
    supabase
      .from('transactions')
      .select('amount, branches(name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('created_at', mtdStart),

    // Products sold MTD via order_items
    supabase
      .from('order_items')
      .select('qty, orders!inner(tenant_id, created_at)')
      .eq('orders.tenant_id', tenantId)
      .gte('orders.created_at', mtdStart),
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

// ─── Dashboard metrics ────────────────────────────────────────────────────────

export async function fetchDashboardMetrics(tenantId) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [txRes, productRes, staffRes, recentRes] = await Promise.all([
    // Today's transactions
    supabase
      .from('transactions')
      .select('amount, method, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString()),
    // Product count + low stock
    supabase
      .from('products')
      .select('id, stock_qty, low_stock_threshold, name')
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
  ])

  const txs = txRes.data ?? []
  const products = productRes.data ?? []
  const staff = staffRes.data ?? []
  const recent = recentRes.data ?? []

  const todayRevenue = txs.reduce((s, t) => s + parseFloat(t.amount), 0)
  const todayOrders = txs.length
  const lowStock = products.filter(p => p.stock_qty <= (p.low_stock_threshold ?? 10))

  // Weekly chart: last 7 days
  const weekData = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const label = d.toLocaleDateString('en-US', { weekday: 'short' })
    weekData.push({ name: label, revenue: 0, orders: 0 })
  }

  return {
    todayRevenue,
    todayOrders,
    totalProducts: products.length,
    activeStaff: staff.length,
    lowStockItems: lowStock,
    recentTransactions: recent,
    weekData,
  }
}
