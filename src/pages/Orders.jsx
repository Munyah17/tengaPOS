import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Eye, Bell, CheckCircle, Clock, Flame, Timer, Car, Store, X, Trash2, Loader2 } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import DateInput, { TimeField } from '@/components/common/DateInput'
import Modal from '@/components/common/Modal'
import { formatCurrency, formatDateTime } from '@/utils/formatters'
import { combineDateAndTime } from '@/utils/dateRanges'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchOrders, deleteOrder } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import toast from 'react-hot-toast'

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
  const { tenant, role } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const [rawOrders, setRawOrders] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const [viewOrder, setViewOrder] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  // Re-render periodically so "elapsed minutes" on restaurant order cards
  // keeps ticking even with no new realtime events
  const [, setClockTick] = useState(0)

  // Same live-sync pattern as Kitchen.jsx — previously this page only
  // fetched once on mount, so an order advancing through the kitchen
  // (received -> cooking -> ready) never reflected here without a manual
  // reload. Now both boards subscribe to the same table and stay in sync.
  useEffect(() => {
    if (!tenant?.id) return
    const loadOrders = () => loadWithOfflineCache(['orders', tenant.id], () => fetchOrders(tenant.id), { onData: setRawOrders })
    loadOrders()
    window.addEventListener('tengapos:force-refresh', loadOrders)

    const channel = supabase
      .channel(`orders-board-${tenant.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          supabase.from('orders').select('*, order_items(*), users(name)').eq('id', payload.new.id).single()
            .then(({ data }) => { if (data) setRawOrders(prev => [data, ...prev]) })
        } else if (payload.eventType === 'UPDATE') {
          setRawOrders(prev => prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o))
        } else if (payload.eventType === 'DELETE') {
          setRawOrders(prev => prev.filter(o => o.id !== payload.old.id))
        }
      })
      .subscribe()

    const clock = setInterval(() => setClockTick(t => t + 1), 30000)
    return () => {
      supabase.removeChannel(channel)
      clearInterval(clock)
      window.removeEventListener('tengapos:force-refresh', loadOrders)
    }
  }, [tenant?.id])

  const handleDeleteOrder = async (order) => {
    if (!window.confirm(`Delete order ${order.id}? This can't be undone.`)) return
    setDeletingId(order._raw.id)
    try {
      await deleteOrder(order._raw.id)
      setRawOrders((prev) => prev.filter((o) => o.id !== order._raw.id))
      toast.success('Order deleted')
    } catch (err) {
      toast.error(err.message || 'Failed to delete order')
    } finally {
      setDeletingId(null)
    }
  }

  const dbOrders = useMemo(() => rawOrders.map(o => ({
    id: o.order_no || o.id,
    date: o.created_at,
    customer: 'Walk-in',
    items: o.order_items?.reduce((s, i) => s + i.qty, 0) ?? 0,
    total: parseFloat(o.total),
    method: o.payment_method || '—',
    status: o.status,
    _raw: o,
  })), [rawOrders])

  const restaurantOrders = useMemo(() => rawOrders
    .filter(o => o.pos_mode === 'restaurant' && !['completed', 'cancelled'].includes(o.status))
    .map(o => ({
      id: o.order_no || `#${o.id.slice(0, 6)}`,
      items: (o.order_items || []).map(i => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`),
      status: o.status,
      orderType: o.type,
      total: parseFloat(o.total),
      time: new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      elapsed: Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000),
    })), [rawOrders])

  const allOrders = dbOrders

  const orders = useMemo(() => {
    if (!dateFrom && !dateTo) return allOrders
    return allOrders.filter(o => {
      const d = new Date(o.date)
      if (dateFrom && d < combineDateAndTime(dateFrom, timeFrom, '00:00', 0)) return false
      if (dateTo && d > combineDateAndTime(dateTo, timeTo, '23:59', 59.999)) return false
      return true
    })
  }, [allOrders, dateFrom, dateTo, timeFrom, timeTo])

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
            <div className="flex flex-wrap items-center gap-2">
              <DateInput value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" className="w-36" />
              <TimeField value={timeFrom} onChange={e => setTimeFrom(e.target.value)} />
              <span className="text-xs text-slate-400">—</span>
              <DateInput value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" className="w-36" />
              <TimeField value={timeTo} onChange={e => setTimeTo(e.target.value)} />
              {dateFiltered && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeFrom(''); setTimeTo('') }} className="text-slate-400 hover:text-red-500">
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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setViewOrder(order)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="View order details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {role === 'vendor' && (
                        <button
                          onClick={() => handleDeleteOrder(order)}
                          disabled={deletingId === order._raw.id}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950/40"
                          title="Delete order"
                        >
                          {deletingId === order._raw.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!viewOrder} onClose={() => setViewOrder(null)} title={`Order ${viewOrder?.id || ''}`}>
        {viewOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-400">Date</p>
                <p className="font-medium text-slate-900 dark:text-white">{formatDateTime(viewOrder.date)}</p>
              </div>
              <div>
                <p className="text-slate-400">Status</p>
                <p className="font-medium text-slate-900 dark:text-white">{viewOrder.status}</p>
              </div>
              <div>
                <p className="text-slate-400">Payment</p>
                <p className="font-medium text-slate-900 dark:text-white">{viewOrder.method}</p>
              </div>
              <div>
                <p className="text-slate-400">Served by</p>
                <p className="font-medium text-slate-900 dark:text-white">{viewOrder._raw.users?.name || '—'}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Items</p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {(viewOrder._raw.order_items || []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{item.name} <span className="text-slate-400">x{item.qty}</span></span>
                    <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(item.total ?? item.unit_price * item.qty)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-bold text-slate-900 dark:border-slate-800 dark:text-white">
              <span>Total</span>
              <span>{formatCurrency(viewOrder.total)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
