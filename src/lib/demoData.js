import { generateUUID } from '@/lib/uuid'

// Seed data for the public /demo sandbox -- one realistic tenant
// ("Demo Retail Store"), enough products/history that Dashboard/Reports
// charts actually show something on first load instead of an empty state.
// Every ID here is a real UUID (not a human-readable slug) so anything
// that round-trips through a UUID-shaped field (order_id, product_id in
// a cart line, etc.) behaves exactly like the real app would.

export const DEMO_TENANT_ID = generateUUID()
export const DEMO_BRANCH_ID = generateUUID()

export const DEMO_CATEGORIES = [
  { id: generateUUID(), name: 'Groceries', color: '#3b82f6' },
  { id: generateUUID(), name: 'Beverages', color: '#22c55e' },
  { id: generateUUID(), name: 'Household', color: '#f59e0b' },
  { id: generateUUID(), name: 'Snacks', color: '#8b5cf6' },
]

const [catGroceries, catBeverages, catHousehold, catSnacks] = DEMO_CATEGORIES

function product(name, categoryId, price, stock, opts = {}) {
  return {
    id: generateUUID(),
    tenant_id: DEMO_TENANT_ID,
    branch_id: DEMO_BRANCH_ID,
    name,
    category_id: categoryId,
    price,
    cost_price: Math.round(price * 0.7 * 100) / 100,
    stock_qty: stock,
    low_stock_threshold: opts.lowStockThreshold ?? 10,
    sku: opts.sku || name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 12),
    barcode: opts.barcode || '',
    unit: opts.unit || 'unit',
    is_active: true,
    is_service: false,
    image_url: null,
    image_unavailable: false,
    vat_treatment: 'standard',
    ...opts,
  }
}

export const DEMO_PRODUCTS_SEED = [
  product('Sugar 2kg', catGroceries.id, 2.5, 48),
  product('Mealie Meal 10kg', catGroceries.id, 8.0, 32),
  product('Cooking Oil 2L', catGroceries.id, 4.75, 6, { lowStockThreshold: 10 }),
  product('Rice 5kg', catGroceries.id, 6.2, 21),
  product('Bread', catGroceries.id, 1.2, 40),
  product('Coca-Cola 500ml', catBeverages.id, 1.0, 96),
  product('Mazoe Orange 2L', catBeverages.id, 3.5, 18),
  product('Bottled Water 500ml', catBeverages.id, 0.5, 120),
  product('Dish Soap 750ml', catHousehold.id, 2.2, 27),
  product('Toilet Paper (4 pack)', catHousehold.id, 3.0, 15),
  product('Candles (pack of 6)', catHousehold.id, 1.8, 8, { lowStockThreshold: 10 }),
  product('Potato Chips', catSnacks.id, 1.5, 34),
  product('Biscuits', catSnacks.id, 1.1, 29),
  product('Chocolate Bar', catSnacks.id, 0.9, 60),
]

export const DEMO_BRANCH = { id: DEMO_BRANCH_ID, tenant_id: DEMO_TENANT_ID, name: 'Main Branch', is_main: true, is_active: true }

// One demo user per role -- the role switcher (not separate logins)
// swaps which of these authStore is populated with.
export const DEMO_USERS = {
  vendor:         { id: generateUUID(), name: 'Tendai Moyo',    email: 'vendor@demo.tengapos.co.zw',    role: 'vendor' },
  shop_manager:   { id: generateUUID(), name: 'Rudo Chirwa',    email: 'manager@demo.tengapos.co.zw',   role: 'shop_manager' },
  supervisor:     { id: generateUUID(), name: 'Farai Ncube',    email: 'supervisor@demo.tengapos.co.zw', role: 'supervisor' },
  shop_assistant: { id: generateUUID(), name: 'Tanaka Dube',    email: 'assistant@demo.tengapos.co.zw', role: 'shop_assistant' },
  cashier:        { id: generateUUID(), name: 'Vimbai Sithole', email: 'cashier@demo.tengapos.co.zw',   role: 'cashier' },
}

export const DEMO_TENANT = {
  id: DEMO_TENANT_ID,
  name: 'Demo Retail Store',
  slug: 'demo-retail-store',
  status: 'active',
  pos_mode: 'retail',
  enabled_modes: ['retail'],
  currency: 'USD',
  vat_enabled: true,
  vat_rate: 15.5,
  plan_type: 'standard_plan',
  plan_start_date: new Date().toISOString(),
  features: {},
  is_active: true,
}

// A couple of weeks of history so Reports/Dashboard charts have a real
// shape instead of a flat empty state on the visitor's very first look.
function pastDate(daysAgo, hour = 12) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0)
  return d.toISOString()
}

const PAYMENT_METHODS = ['cash', 'ecocash', 'visa']

function buildHistoricalOrders() {
  const orders = []
  const transactions = []
  for (let day = 13; day >= 0; day--) {
    const salesToday = 2 + Math.floor(Math.random() * 5)
    for (let i = 0; i < salesToday; i++) {
      const items = []
      const lineCount = 1 + Math.floor(Math.random() * 3)
      let subtotal = 0
      for (let j = 0; j < lineCount; j++) {
        const p = DEMO_PRODUCTS_SEED[Math.floor(Math.random() * DEMO_PRODUCTS_SEED.length)]
        const qty = 1 + Math.floor(Math.random() * 3)
        const lineTotal = Math.round(p.price * qty * 100) / 100
        subtotal += lineTotal
        items.push({
          id: generateUUID(), product_id: p.id, name: p.name, sku: p.sku,
          qty, unit_price: p.price, discount: 0, total: lineTotal,
        })
      }
      const tax = Math.round(subtotal * 0.155 * 100) / 100
      const total = Math.round((subtotal + tax) * 100) / 100
      const orderId = generateUUID()
      const createdAt = pastDate(day, 8 + Math.floor(Math.random() * 10))
      const method = PAYMENT_METHODS[Math.floor(Math.random() * PAYMENT_METHODS.length)]
      orders.push({
        id: orderId, tenant_id: DEMO_TENANT_ID, branch_id: DEMO_BRANCH_ID,
        order_no: `DEMO${String(orders.length + 1).padStart(4, '0')}`,
        status: 'completed', type: 'sale', pos_mode: 'retail',
        subtotal, tax_amount: tax, discount_amount: 0, total,
        payment_method: method, created_at: createdAt,
        salesperson_name: null, salesperson_employee_no: null,
        order_items: items,
        users: { name: Object.values(DEMO_USERS)[Math.floor(Math.random() * 2) + 3].name },
      })
      transactions.push({
        id: generateUUID(), tenant_id: DEMO_TENANT_ID, order_id: orderId, branch_id: DEMO_BRANCH_ID,
        reference: `DEMO${String(orders.length).padStart(4, '0')}`,
        type: 'sale', method, amount: total, status: 'completed', created_at: createdAt,
      })
    }
  }
  return { orders, transactions }
}

export const { orders: DEMO_ORDERS_SEED, transactions: DEMO_TRANSACTIONS_SEED } = buildHistoricalOrders()
