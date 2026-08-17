import { useDemoStore } from '@/lib/demoStore'
import { DEMO_TENANT_ID } from '@/lib/demoData'

// Demo-mode counterparts to src/lib/db.js -- same function names/signatures/
// return shapes the real pages already consume, sourced from the in-memory
// demoStore instead of Supabase. dataLayer.js is what actually decides
// which of the two a page gets; nothing in here ever touches the network.

const store = () => useDemoStore.getState()

export async function fetchProducts() {
  return store().products
    .filter((p) => p.is_active)
    .map((p) => {
      const cat = store().categories.find((c) => c.id === p.category_id)
      return { ...p, stock: p.stock_qty ?? 0, category: cat?.name ?? '', image: p.image_url ?? null, imageUnavailable: p.image_unavailable === true }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function insertProduct(_tenantId, product) {
  const row = store().addProduct({
    name: product.name, brand: product.brand || null, sku: product.sku || null, barcode: product.barcode || null,
    price: Number(product.price) || 0, cost_price: Number(product.landingPrice ?? product.costPrice) || 0,
    stock_qty: product.isService ? 0 : Number(product.stock) || 0, low_stock_threshold: parseInt(product.lowStockThreshold) || 10,
    is_service: product.isService === true, unit: product.unit || null, image_url: product.imageUrl || null,
    image_unavailable: product.imageUnavailable === true, vat_treatment: product.vatTreatment || 'standard',
    attributes: product.attributes || {}, category_id: product.categoryId || null,
    price_tiers: product.priceTiers || [], dispensing_class: product.dispensingClass || 'otc',
    age_restricted: product.ageRestricted === true, is_active: true,
  })
  return { ...row, stock: row.stock_qty ?? 0, category: '', image: row.image_url ?? null }
}

export async function bulkInsertProducts(_tenantId, rows, onProgress) {
  const result = store().bulkAddProducts(rows)
  onProgress?.(rows.length, rows.length)
  return result
}

export async function updateProduct(id, updates) {
  const row = store().updateProductRow(id, {
    name: updates.name, brand: updates.brand || null, sku: updates.sku || null, barcode: updates.barcode || null,
    price: Number(updates.price) || 0, cost_price: Number(updates.landingPrice) || 0,
    stock_qty: updates.isService ? 0 : Number(updates.stock) || 0, low_stock_threshold: parseInt(updates.lowStockThreshold) || 10,
    is_service: updates.isService === true, unit: updates.unit || null, image_url: updates.imageUrl || null,
    image_unavailable: updates.imageUnavailable === true, vat_treatment: updates.vatTreatment || 'standard',
    attributes: updates.attributes || {}, category_id: updates.categoryId || null,
    price_tiers: updates.priceTiers || [], dispensing_class: updates.dispensingClass || 'otc',
    age_restricted: updates.ageRestricted === true,
  })
  return { ...row, stock: row.stock_qty ?? 0, image: row.image_url ?? null }
}

export async function deleteProduct(id) {
  store().deleteProductRow(id)
}

export async function fetchCategories() {
  return store().categories
}

export async function createCategory(_tenantId, { name, color }) {
  return store().addCategory({ name, color })
}

export async function uploadProductImage(_tenantId, file) {
  // No storage backend in demo mode -- render the picked file locally
  // instead of a real hosted URL, which is enough to preview the change.
  return URL.createObjectURL(file)
}

export async function sendReceiptViaWhatsApp() {
  // WhatsApp receipts are a paid add-on backed by a real Business API call
  // -- simulate success without an actual send, so the demo flow completes.
  return { ok: true, simulated: true }
}

export async function saveCheckout({ branchId, userId, cartItems, paymentMethod, subtotal, tax, total, posMode, orderType, salespersonName, salespersonEmployeeNo }) {
  return store().checkout({ branchId, userId, cartItems, paymentMethod, subtotal, tax, total, posMode, orderType, salespersonName, salespersonEmployeeNo })
}

export async function fetchOrders(_tenantId, filters = {}) {
  let rows = store().orders
  if (filters.posMode) rows = rows.filter((o) => o.pos_mode === filters.posMode)
  if (filters.status) rows = rows.filter((o) => o.status === filters.status)
  if (filters.notStatus) rows = rows.filter((o) => o.status !== filters.notStatus)
  if (filters.fromDate) rows = rows.filter((o) => o.created_at >= filters.fromDate)
  if (filters.toDate) rows = rows.filter((o) => o.created_at <= filters.toDate)
  return [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export async function deleteOrder(orderId) {
  store().deleteOrderRow(orderId)
}

export async function fetchTransactions() {
  const s = store()
  return [...s.transactions]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((t) => {
      const order = s.orders.find((o) => o.id === t.order_id)
      const user = s.staff.find((u) => u.id === t.processed_by)
      return {
        ...t,
        orders: order ? { order_no: order.order_no, subtotal: order.subtotal, tax_amount: order.tax_amount, total: order.total, order_items: order.order_items } : null,
        users: user ? { name: user.name } : null,
        branches: { name: s.branches[0]?.name },
      }
    })
}

export async function fetchTransactionsInRange(_tenantId, startISO, endISO) {
  const all = await fetchTransactions()
  return all.filter((t) => t.created_at >= startISO && t.created_at <= endISO)
}

export async function clearVoidedTransactions() {
  store().clearVoidedTransactionsRows()
}

export async function fetchVoids() {
  return store().voids
}
export async function requestVoid(orderId, reason) {
  return store().requestVoidRow(orderId, reason)
}
export async function approveVoid(voidId) {
  store().setVoidStatus(voidId, 'approved')
}
export async function validateVoid(voidId) {
  store().setVoidStatus(voidId, 'validated')
}
export async function rejectVoid(voidId, reason) {
  store().setVoidStatus(voidId, 'rejected', reason)
}

export async function fetchReturns() {
  return store().returns
}
export async function requestReturn(orderId, reason, refundAmount) {
  return store().requestReturnRow(orderId, reason, refundAmount)
}
export async function approveReturn(returnId) {
  store().setReturnStatus(returnId, 'approved')
}
export async function validateReturn(returnId) {
  store().setReturnStatus(returnId, 'validated')
}
export async function rejectReturn(returnId, reason) {
  store().setReturnStatus(returnId, 'rejected', reason)
}

export async function fetchStaff() {
  return store().staff.filter((u) => !u.deleted_at).sort((a, b) => a.name.localeCompare(b.name))
}
export async function updateStaffStatus(userId, isActive) {
  store().updateStaffRow(userId, { is_active: isActive })
}
export async function updateStaffUsername(userId, username) {
  store().updateStaffRow(userId, { username })
}
export async function updateStaffEmployeeNo(userId, employeeNo) {
  store().updateStaffRow(userId, { employee_no: employeeNo || null })
}
export async function updateStaffName(userId, name) {
  store().updateStaffRow(userId, { name })
}
export async function fetchUserBranches(userId) {
  return store().userBranches[userId] || []
}
export async function assignUserBranch(userId, branchId) {
  store().assignUserBranchRow(userId, branchId)
}
export async function unassignUserBranch(userId, branchId) {
  store().unassignUserBranchRow(userId, branchId)
}
export async function fetchProductBranches(productId) {
  return store().productBranches[productId] || []
}
export async function assignProductBranch(productId, branchId) {
  store().assignProductBranchRow(productId, branchId)
}
export async function unassignProductBranch(productId, branchId) {
  store().unassignProductBranchRow(productId, branchId)
}

export async function fetchBranches() {
  return store().branches
}

export async function fetchStockTransfers() {
  const s = store()
  return s.stockTransfers.map((t) => {
    const p = s.products.find((pr) => pr.id === t.product_id)
    return { ...t, products: p ? { name: p.name, sku: p.sku } : null, from_branch: { name: s.branches[0]?.name }, to_branch: { name: s.branches[0]?.name }, users: { name: null } }
  })
}
export async function transferStock(_tenantId, productId, toBranchId, qty, note) {
  return store().transferStockRow(productId, toBranchId, qty, note)
}
export async function fetchStockReceipts() {
  const s = store()
  return s.stockReceipts.map((r) => {
    const p = s.products.find((pr) => pr.id === r.product_id)
    return { ...r, products: p ? { name: p.name, sku: p.sku } : null, users: { name: null } }
  })
}
export async function receiveStock(_tenantId, productId, qty, note) {
  return store().receiveStockRow(productId, qty, note)
}

export async function adjustStock(_tenantId, productId, newQty, note) {
  return store().adjustStockRow(productId, newQty, note)
}

export async function fetchStockAdjustments() {
  const s = store()
  return s.stockAdjustments.map((a) => {
    const p = s.products.find((pr) => pr.id === a.product_id)
    return { ...a, products: p ? { name: p.name, sku: p.sku } : null, users: { name: null } }
  })
}

// ─── Job cards / prescriptions / age verification ──────────────────────────
// Demo tenant is retail-mode only -- these code paths never actually run
// from the demo UI, but the real pages import them unconditionally.
export async function fetchJobCards() { return [] }
export async function completeJobCard() {}
export async function recordPrescriptionDispense() {}
export async function recordAgeVerification() {}

// ─── Dashboard / Reports metrics ────────────────────────────────────────────

export async function fetchVendorRequests() {
  const s = store()
  const pendingVoids = s.voids.filter((v) => ['requested', 'approved'].includes(v.status))
  const pendingReturns = s.returns.filter((r) => ['requested', 'approved'].includes(r.status))
  return {
    receiptConfigs: [], voids: pendingVoids, returns: pendingReturns, payments: [], configChanges: [],
    total: pendingVoids.length + pendingReturns.length,
  }
}

export async function fetchVendorNudges() {
  // Demo has no cash_ups/real validated-return history to nudge about --
  // both stay quiet so a visitor doesn't get told to review a "today" that
  // doesn't correspond to anything they did in the sandbox.
  return { cashUpMissingToday: false, refundsThisWeek: 0 }
}

export async function fetchDashboardMetrics() {
  const s = store()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6)

  const txsToday = s.transactions.filter((t) => t.status === 'completed' && new Date(t.created_at) >= todayStart)
  const weekTxs = s.transactions.filter((t) => t.status === 'completed' && new Date(t.created_at) >= weekStart)
  const activeProducts = s.products.filter((p) => p.is_active)
  const lowStock = activeProducts.filter((p) => p.stock_qty <= (p.low_stock_threshold ?? 10))

  const dayBuckets = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart); d.setDate(d.getDate() - i)
    dayBuckets[d.toDateString()] = { name: d.toLocaleDateString('en-US', { weekday: 'short' }), revenue: 0, orders: 0 }
  }
  for (const t of weekTxs) {
    const key = new Date(t.created_at).toDateString()
    if (dayBuckets[key]) { dayBuckets[key].revenue += parseFloat(t.amount); dayBuckets[key].orders += 1 }
  }

  const weekOrders = s.orders.filter((o) => new Date(o.created_at) >= weekStart)
  const productAgg = {}
  for (const o of weekOrders) {
    for (const it of o.order_items) {
      if (!productAgg[it.name]) productAgg[it.name] = { name: it.name, sold: 0, revenue: 0 }
      productAgg[it.name].sold += it.qty || 0
      productAgg[it.name].revenue += Number(it.total) || 0
    }
  }
  const topProducts = Object.values(productAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  const catCounts = {}
  for (const p of activeProducts) {
    const cat = s.categories.find((c) => c.id === p.category_id)?.name || 'Uncategorised'
    catCounts[cat] = (catCounts[cat] || 0) + 1
  }
  const totalCatCount = activeProducts.length || 1
  const categoryData = Object.entries(catCounts)
    .map(([name, count]) => ({ name, value: Math.round((count / totalCatCount) * 100) }))
    .sort((a, b) => b.value - a.value).slice(0, 6)

  const recentTransactions = [...s.transactions]
    .filter((t) => t.status === 'completed')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)
    .map((t) => {
      const order = s.orders.find((o) => o.id === t.order_id)
      return { ...t, orders: order ? { order_items: order.order_items.map((i) => ({ qty: i.qty })) } : null }
    })

  return {
    todayRevenue: txsToday.reduce((sum, t) => sum + parseFloat(t.amount), 0),
    todayOrders: txsToday.length,
    totalProducts: activeProducts.length,
    activeStaff: s.staff.filter((u) => u.is_active).length,
    lowStockItems: lowStock,
    recentTransactions,
    weekData: Object.values(dayBuckets),
    topProducts,
    categoryData,
  }
}

export async function fetchMyDashboardMetrics() {
  return fetchDashboardMetrics()
}

export async function fetchReportMetrics(_tenantId, { startDate, endDate } = {}) {
  const s = store()
  const now = new Date()
  const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()
  const periodStart = startDate || mtdStart
  const periodEnd = endDate || now.toISOString()

  const periodTx = s.transactions.filter((t) => t.status === 'completed' && t.created_at >= periodStart && t.created_at <= periodEnd)
  const sixMoTx = s.transactions.filter((t) => t.status === 'completed' && t.created_at >= sixMonthsAgo)
  const periodOrders = s.orders.filter((o) => o.created_at >= periodStart && o.created_at <= periodEnd)

  const mtdRevenue = periodTx.reduce((sum, t) => sum + parseFloat(t.amount), 0)
  const mtdOrders = periodTx.length
  const avgOrderValue = mtdOrders > 0 ? mtdRevenue / mtdOrders : 0
  const productsSold = periodOrders.reduce((sum, o) => sum + o.order_items.reduce((s2, i) => s2 + (i.qty || 0), 0), 0)

  const monthMap = {}
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMap[key] = { month: d.toLocaleDateString('en-US', { month: 'short' }), revenue: 0, orders: 0 }
  }
  for (const t of sixMoTx) {
    const d = new Date(t.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (monthMap[key]) { monthMap[key].revenue += parseFloat(t.amount); monthMap[key].orders += 1 }
  }

  const branchName = s.branches[0]?.name || 'Main Branch'
  const branchData = [{ branch: branchName, revenue: mtdRevenue, orders: mtdOrders }]

  return { mtdRevenue, mtdOrders, avgOrderValue, productsSold, monthlyData: Object.values(monthMap), branchData }
}

export function getDemoTenantId() {
  return DEMO_TENANT_ID
}
