import { create } from 'zustand'
import { generateUUID } from '@/lib/uuid'
import {
  DEMO_TENANT_ID, DEMO_BRANCH_ID, DEMO_CATEGORIES, DEMO_PRODUCTS_SEED,
  DEMO_BRANCH, DEMO_USERS, DEMO_ORDERS_SEED, DEMO_TRANSACTIONS_SEED,
} from '@/lib/demoData'

// Mutable in-memory "database" backing the /demo sandbox. Every action here
// mirrors a real db.js mutation (same net effect on the shape the real
// pages already know how to render), but nothing here ever touches
// Supabase or persists past a page reload -- that's the whole point of the
// demo: a prospective client can click around freely with zero risk of
// leaving real data behind, and zero risk of a demo session touching a
// real tenant's database.

function freshState() {
  return {
    products: DEMO_PRODUCTS_SEED.map((p) => ({ ...p })),
    categories: DEMO_CATEGORIES.map((c) => ({ ...c })),
    branches: [{ ...DEMO_BRANCH }],
    staff: Object.values(DEMO_USERS).map((u) => ({
      ...u,
      tenant_id: DEMO_TENANT_ID,
      is_active: true,
      username: u.email.split('@')[0],
      employee_no: null,
      deleted_at: null,
    })),
    orders: DEMO_ORDERS_SEED.map((o) => ({ ...o, order_items: o.order_items.map((i) => ({ ...i })) })),
    transactions: DEMO_TRANSACTIONS_SEED.map((t) => ({ ...t })),
    voids: [],
    returns: [],
    stockTransfers: [],
    stockReceipts: [],
    userBranches: Object.fromEntries(Object.values(DEMO_USERS).map((u) => [u.id, [DEMO_BRANCH_ID]])),
    productBranches: Object.fromEntries(DEMO_PRODUCTS_SEED.map((p) => [p.id, [DEMO_BRANCH_ID]])),
    role: 'vendor',
  }
}

export const useDemoStore = create((set, get) => ({
  ...freshState(),

  resetDemo: () => set(freshState()),
  setRole: (role) => set({ role }),

  addProduct: (product) => {
    const row = { ...product, id: generateUUID(), tenant_id: DEMO_TENANT_ID, branch_id: DEMO_BRANCH_ID }
    set((s) => ({ products: [...s.products, row] }))
    return row
  },
  bulkAddProducts: (rows) => {
    const inserted = rows.map((product) => ({
      ...product, id: generateUUID(), tenant_id: DEMO_TENANT_ID, branch_id: DEMO_BRANCH_ID,
      is_active: true,
    }))
    set((s) => ({ products: [...s.products, ...inserted] }))
    return { inserted: inserted.length, total: rows.length, failedChunks: [] }
  },
  updateProductRow: (id, updates) => {
    let updated = null
    set((s) => ({
      products: s.products.map((p) => {
        if (p.id !== id) return p
        updated = { ...p, ...updates, id }
        return updated
      }),
    }))
    return updated
  },
  deleteProductRow: (id) => {
    set((s) => ({ products: s.products.map((p) => (p.id === id ? { ...p, is_active: false } : p)) }))
  },
  addCategory: ({ name, color }) => {
    const row = { id: generateUUID(), tenant_id: DEMO_TENANT_ID, name, color: color || null }
    set((s) => ({ categories: [...s.categories, row] }))
    return row
  },

  receiveStockRow: (productId, qty, note) => {
    const receipt = { id: generateUUID(), tenant_id: DEMO_TENANT_ID, product_id: productId, qty, note: note || null, created_at: new Date().toISOString() }
    set((s) => ({
      products: s.products.map((p) => (p.id === productId ? { ...p, stock_qty: (p.stock_qty ?? 0) + qty } : p)),
      stockReceipts: [receipt, ...s.stockReceipts],
    }))
    return receipt
  },
  transferStockRow: (productId, toBranchId, qty, note) => {
    const transfer = { id: generateUUID(), tenant_id: DEMO_TENANT_ID, product_id: productId, to_branch_id: toBranchId, qty, note: note || null, created_at: new Date().toISOString() }
    set((s) => ({ stockTransfers: [transfer, ...s.stockTransfers] }))
    return transfer
  },

  checkout: ({ branchId, userId, cartItems, paymentMethod, subtotal, tax, total, posMode, orderType, salespersonName, salespersonEmployeeNo }) => {
    const state = get()
    const orderId = generateUUID()
    const items = cartItems.map((item) => ({
      id: generateUUID(), product_id: item.id, name: item.name, sku: item.sku || null,
      qty: item.quantity, unit_price: item.price, discount: item.itemDiscount || 0,
      total: item.price * item.quantity * (1 - (item.itemDiscount || 0) / 100),
    }))
    const orderNo = `DEMO${String(state.orders.length + 1).padStart(4, '0')}`
    const now = new Date().toISOString()
    const order = {
      id: orderId, tenant_id: DEMO_TENANT_ID, branch_id: branchId || DEMO_BRANCH_ID,
      order_no: orderNo, status: 'completed', type: orderType || 'sale', pos_mode: posMode || 'retail',
      subtotal, tax_amount: tax, discount_amount: 0, total,
      payment_method: paymentMethod || 'cash', created_at: now,
      salesperson_name: salespersonName || null, salesperson_employee_no: salespersonEmployeeNo || null,
      order_items: items,
      users: { name: state.staff.find((u) => u.id === userId)?.name || null },
    }
    const receiptNo = `DEMO-${orderNo}`
    const transaction = {
      id: generateUUID(), tenant_id: DEMO_TENANT_ID, order_id: orderId, branch_id: branchId || DEMO_BRANCH_ID,
      reference: receiptNo, type: 'sale', method: paymentMethod || 'cash', amount: total, status: 'completed', created_at: now,
    }
    set((s) => ({
      orders: [order, ...s.orders],
      transactions: [transaction, ...s.transactions],
      products: s.products.map((p) => {
        const line = cartItems.find((c) => c.id === p.id)
        return line ? { ...p, stock_qty: Math.max(0, (p.stock_qty ?? 0) - line.quantity) } : p
      }),
    }))
    return { order: { id: orderId }, receiptNo }
  },

  deleteOrderRow: (orderId) => {
    set((s) => ({
      orders: s.orders.filter((o) => o.id !== orderId),
      transactions: s.transactions.filter((t) => t.order_id !== orderId),
    }))
  },

  requestVoidRow: (orderId, reason) => {
    const row = {
      id: generateUUID(), tenant_id: DEMO_TENANT_ID, order_id: orderId, reason, status: 'requested',
      created_at: new Date().toISOString(), orders: { order_no: get().orders.find((o) => o.id === orderId)?.order_no },
      requester: { name: get().staff.find((u) => u.role === get().role)?.name }, approver: null, validator: null,
    }
    set((s) => ({ voids: [row, ...s.voids] }))
    return row
  },
  setVoidStatus: (voidId, status, reason) => {
    set((s) => ({
      voids: s.voids.map((v) => (v.id === voidId ? { ...v, status, reason: reason ?? v.reason } : v)),
    }))
  },
  requestReturnRow: (orderId, reason, refundAmount) => {
    const row = {
      id: generateUUID(), tenant_id: DEMO_TENANT_ID, order_id: orderId, reason, refund_amount: refundAmount, status: 'requested',
      created_at: new Date().toISOString(), orders: { order_no: get().orders.find((o) => o.id === orderId)?.order_no },
      requester: { name: get().staff.find((u) => u.role === get().role)?.name }, approver: null, validator: null,
    }
    set((s) => ({ returns: [row, ...s.returns] }))
    return row
  },
  setReturnStatus: (returnId, status, reason) => {
    set((s) => ({
      returns: s.returns.map((r) => (r.id === returnId ? { ...r, status, reason: reason ?? r.reason } : r)),
    }))
  },
  clearVoidedTransactionsRows: () => {
    set((s) => {
      const voidedOrderIds = new Set(s.voids.filter((v) => v.status === 'validated').map((v) => v.order_id))
      return { transactions: s.transactions.filter((t) => !voidedOrderIds.has(t.order_id)) }
    })
  },

  updateStaffRow: (userId, updates) => {
    set((s) => ({ staff: s.staff.map((u) => (u.id === userId ? { ...u, ...updates } : u)) }))
  },
  assignUserBranchRow: (userId, branchId) => {
    set((s) => ({
      userBranches: { ...s.userBranches, [userId]: [...new Set([...(s.userBranches[userId] || []), branchId])] },
    }))
  },
  unassignUserBranchRow: (userId, branchId) => {
    set((s) => ({
      userBranches: { ...s.userBranches, [userId]: (s.userBranches[userId] || []).filter((b) => b !== branchId) },
    }))
  },
  assignProductBranchRow: (productId, branchId) => {
    set((s) => ({
      productBranches: { ...s.productBranches, [productId]: [...new Set([...(s.productBranches[productId] || []), branchId])] },
    }))
  },
  unassignProductBranchRow: (productId, branchId) => {
    set((s) => ({
      productBranches: { ...s.productBranches, [productId]: (s.productBranches[productId] || []).filter((b) => b !== branchId) },
    }))
  },
}))
