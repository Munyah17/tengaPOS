import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Eye, Bell, CheckCircle, Clock, Flame, Timer, Car, Store, X } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import { formatCurrency, formatDateTime } from '@/utils/formatters'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { useOrderStore } from '@/stores/orderStore'
import { fetchOrders } from '@/lib/db'
import toast from 'react-hot-toast'

const DEMO_ORDERS = [
  { id: 'TP-260524-0001', date: '2026-05-24T14:30:00', items: 3, total: 15.50, method: 'Cash', status: 'completed', customer: 'Walk-in' },
  { id: 'TP-260524-0002', date: '2026-05-24T14:22:00', items: 7, total: 42.75, method: 'EcoCash', status: 'completed', customer: 'Walk-in' },
  { id: 'TP-260524-0003', date: '2026-05-24T14:15:00', items: 2, total: 8.20, method: 'Cash', status: 'completed', customer: 'Walk-in' },
  { id: 'TP-260524-0004', date: '2026-05-24T14:08:00', items: 12, total: 67.90, method: 'Visa', status: 'completed', customer: 'John D.' },
  { id: 'TP-260524-0005', date: '2026-05-24T13:55:00', items: 4, total: 23.00, method: 'InnBucks', status: 'refunded', customer: 'Walk-in' },
  { id: 'TP-260524-0006', date: '2026-05-24T13:40:00', items: 8, total: 55.25, method: 'Mastercard', status: 'completed', customer: 'Sarah M.' },
  { id: 'TP-260524-0007', date: '2026-05-24T13:25:00', items: 1, total: 5.99, method: 'Cash', status: 'completed', customer: 'Walk-in' },
]

const DEMO_RESTAURANT_ORDERS = [
  { id: '#047', items: ['Zinger Burger x2', 'Large Fries', 'Coke 500ml'], status: 'cooking',  orderType: 'counter',       total: 18.50, time: '14:28', elapsed: 14 },
  { id: '#048', items: ['Streetwise 2', 'Coleslaw'],                       status: 'cooking',  orderType: 'drive_through', total: 14.00, time: '14:20', elapsed: 22 },
  { id: '#049', items: ['Grilled Chicken Wrap', 'Water 500ml'],            status: 'waiting',  orderType: 'counter',       total: 12.00, time: '14:25', elapsed: 17 },
  { id: '#050', items: ['Family Bucket', 'Chips x3', 'Fanta x3'],         status: 'ready',    orderType: 'drive_through', total: 41.00, time: '14:17', elapsed: 25 },
  { id: '#051', items: ['Double Smash Burger'],                            status: 'received', orderType: 'counter',       total: 8.50,  time: '14:41', elapsed: 1  },
]

const ORDER_STATUS = {
  received: { label: 'Received', icon: Clock, bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  waiting:  { label: 'Waiting',  icon: Timer, bg: 'bg-yellow-50 dark:bg-yellow-950/40', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  cooking:  { label: 'Cooking',  icon: Flame, bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  ready:    { label: 'Ready',    icon: CheckCircle, bg: 'bg-green-50 dark:bg-green-950/40', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
}

const exportColumns = [
  { header: 'Order ID', key: 'id' },
  { header: 'Date', key: 'date' },
  { header: 'Items', key: 'items' },
  { header: 'Total', key: 'total' },
  { header: 'Method', key: 'method' },
  { header: 'Status', key: 'status' },
]

function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'square'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch {}
}

function RestaurantOrders({ orders }) {
  const [ringed, setRinged] = useState({})

  const ringKitchen = (orderId) => {
    playBeep()
    setRinged((r) => ({ ...r, [orderId]: true }))
    toast.success(`Kitchen alerted for order ${orderId}!`, { icon: '🔔', duration: 3000 })
    setTimeout(() => setRinged((r) => ({ ...r, [orderId]: false })), 30000)
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-700">
        <Clock className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
        <p className="text-sm font-medium text-slate-500">No active orders</p>
        <p className="mt-1 text-xs text-slate-400">Orders placed on the POS will appear here</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {orders.map((order, i) => {
        const st = ORDER_STATUS[order.status] || ORDER_STATUS.received
        const Icon = st.icon
        const isOverdue = order.elapsed > 20
        const hasRinged = ringed[order.id]

        return (
          <motion.div
            key={order.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`rounded-2xl border p-4 ${st.bg} ${isOverdue ? 'border-red-300 dark:border-red-700' : 'border-transparent'}`}
          >
            {/* Card header */}
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-extrabold text-slate-900 dark:text-white">{order.id}</span>
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    order.orderType === 'drive_through'
                      ? 'bg-yellow-400 text-yellow-900'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  }`}>
                    {order.orderType === 'drive_through' ? <Car className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                    {order.orderType === 'drive_through' ? 'Drive-Through' : 'Counter'}
                  </span>
                  {isOverdue && (
                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">overdue</span>
                  )}
                </div>
              </div>
              <div className={`flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold ${st.bg} ${st.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                {st.label}
              </div>
            </div>

            {/* Items */}
            <ul className="mb-3 space-y-1">
              {order.items.map((item, j) => (
                <li key={j} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />
                  {item}
                </li>
              ))}
            </ul>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-black/5 pt-3 dark:border-white/10">
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{order.time}</span>
                <span className={isOverdue ? 'font-bold text-red-600 dark:text-red-400' : ''}>{order.elapsed}m ago</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{formatCurrency(order.total)}</span>
              </div>
              {/* Ring Kitchen — optional, for when order is delayed */}
              <button
                onClick={() => ringKitchen(order.id)}
                disabled={hasRinged}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  hasRinged
                    ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95'
                }`}
                title="Alert kitchen that this order is taking too long"
              >
                <Bell className="h-3.5 w-3.5" />
                {hasRinged ? 'Alerted' : 'Ring Kitchen'}
              </button>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

export default function Orders() {
  const { posMode } = useThemeStore()
  const { isDemo, tenant } = useAuthStore()
  const { orders: liveOrders, seedDemo } = useOrderStore()
  const isRestaurant = posMode === 'restaurant'
  const [dbOrders, setDbOrders] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (isDemo || !tenant?.id) return
    fetchOrders(tenant.id)
      .then(rows => setDbOrders(rows.map(o => ({
        id: o.order_no || o.id,
        date: o.created_at,
        customer: 'Walk-in',
        items: o.order_items?.reduce((s, i) => s + i.qty, 0) ?? 0,
        total: parseFloat(o.total),
        method: o.payment_method || '—',
        status: o.status,
      }))))
      .catch(() => {})
  }, [isDemo, tenant?.id])

  // Seed demo orders for the shared store on first render in restaurant mode
  if (isDemo && isRestaurant && liveOrders.length === 0) seedDemo()

  const restaurantOrders = liveOrders.map((o) => ({
    id: `#${o.number}`,
    items: o.items.map((i) => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`),
    status: o.status,
    orderType: o.type,
    total: o.items.reduce((s, i) => s + i.price * i.qty, 0),
    time: new Date(o.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    elapsed: Math.floor((Date.now() - o.startedAt) / 60000),
  }))

  const allOrders = isDemo ? DEMO_ORDERS : dbOrders

  const orders = useMemo(() => {
    if (!dateFrom && !dateTo) return allOrders
    return allOrders.filter(o => {
      const d = new Date(o.date)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
      return true
    })
  }, [allOrders, dateFrom, dateTo])

  const dateFiltered = dateFrom || dateTo

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Orders</h1>
          <p className="text-sm text-slate-500">
            {isRestaurant ? 'Active orders' : 'View and manage all orders'}
          </p>
        </div>
        {!isRestaurant && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
              <span className="text-xs text-slate-500 whitespace-nowrap">From</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-transparent text-sm text-slate-900 focus:outline-none dark:text-white" />
              <span className="text-xs text-slate-400">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-transparent text-sm text-slate-900 focus:outline-none dark:text-white" />
              {dateFiltered && (
                <button onClick={() => { setDateFrom(''); setDateTo('') }} className="ml-1 text-slate-400 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <ExportMenu data={orders} columns={exportColumns} title={`Orders${dateFiltered ? ` (${dateFrom || '…'} to ${dateTo || '…'})` : ''}`} filename="tengapos_orders" />
          </div>
        )}
      </div>
      {!isRestaurant && dateFiltered && (
        <p className="mb-4 text-xs text-slate-500">
          Showing {orders.length} of {allOrders.length} orders for selected date range
        </p>
      )}

      {isRestaurant ? (
        <RestaurantOrders orders={restaurantOrders} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                {['Order ID', 'Date', 'Customer', 'Items', 'Total', 'Payment', 'Status', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                    No orders yet — complete a sale on the POS to see it here.
                  </td>
                </tr>
              ) : orders.map((order) => (
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3 text-sm font-mono font-medium text-slate-900 dark:text-white">{order.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(order.date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{order.customer}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{order.items}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(order.total)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">{order.method}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${order.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
