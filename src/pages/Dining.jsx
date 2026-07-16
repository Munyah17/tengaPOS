import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Car, Store, ChefHat, Clock } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'

function waitLabel(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function OrderTile({ order, now }) {
  const isDT = order.type === 'drive_through'
  const isReady = order.status === 'ready'
  const waited = order.readyAt ? now - order.readyAt : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`relative flex flex-col items-center justify-center rounded-2xl p-4 text-center select-none ${
        isReady
          ? isDT
            ? 'bg-yellow-400 text-yellow-900'
            : 'bg-green-500 text-white'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
      }`}
    >
      {isDT && (
        <Car className={`absolute right-2 top-2 h-4 w-4 opacity-60 ${isReady ? 'text-yellow-800' : 'text-slate-400'}`} />
      )}
      <span className={`font-extrabold leading-none ${isReady ? 'text-4xl' : 'text-3xl'}`}>
        #{order.number}
      </span>
      {isReady && waited !== null && (
        <span className="mt-1 text-xs font-semibold opacity-80">{waitLabel(waited)}</span>
      )}
    </motion.div>
  )
}

export default function Dining() {
  // This is a public route (no /:tenantId in the path) meant for a
  // second-screen display device — it relies on the persisted auth state
  // from a prior login on this same browser, same as Kitchen/Orders.
  // Previously it read from a Zustand store nothing ever populated for
  // real tenants, so it never showed anything beyond dev-time seed data.
  const { tenant } = useAuthStore()
  const [rawOrders, setRawOrders] = useState([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!tenant?.id) return

    supabase
      .from('orders')
      .select('id, order_no, status, type, created_at, updated_at')
      .eq('tenant_id', tenant.id)
      .eq('pos_mode', 'restaurant')
      .not('status', 'in', '(completed,cancelled)')
      .then(({ data }) => setRawOrders(data || []))

    const channel = supabase
      .channel(`dining-${tenant.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `tenant_id=eq.${tenant.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          if (payload.new.pos_mode !== 'restaurant') return
          setRawOrders(prev => [payload.new, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setRawOrders(prev => {
            if (['completed', 'cancelled'].includes(payload.new.status)) {
              return prev.filter(o => o.id !== payload.new.id)
            }
            return prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o)
          })
        } else if (payload.eventType === 'DELETE') {
          setRawOrders(prev => prev.filter(o => o.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tenant?.id])

  const orders = rawOrders.map(o => ({
    id: o.id,
    number: o.order_no || o.id.slice(0, 6),
    status: o.status,
    type: o.type,
    startedAt: new Date(o.created_at).getTime(),
    // No dedicated ready_at column — updated_at is a reasonable proxy since
    // the last write to a 'ready' order is normally the transition to it.
    readyAt: o.status === 'ready' ? new Date(o.updated_at).getTime() : null,
  }))

  const preparing = orders.filter((o) => o.status !== 'ready')
  const readyCounter = orders.filter((o) => o.status === 'ready' && o.type === 'counter')
  const readyDT = orders.filter((o) => o.status === 'ready' && o.type === 'drive_through')

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <ChefHat className="h-7 w-7 text-green-400" />
          <div>
            <h1 className="text-xl font-extrabold">Order Display</h1>
            <p className="text-xs text-slate-400">Live kitchen status</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          {new Date(now).toLocaleTimeString()}
        </div>
      </div>

      <div className="grid h-[calc(100vh-65px)] md:grid-cols-[1fr_320px]">
        {/* PREPARING */}
        <div className="flex flex-col border-b border-white/10 md:border-b-0 md:border-r">
          <div className="border-b border-white/10 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-orange-400" />
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Preparing</h2>
              <span className="ml-auto rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-bold text-orange-400">{preparing.length}</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {preparing.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-600">
                <ChefHat className="h-10 w-10 opacity-30" />
                <p className="text-sm">No orders in preparation</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {preparing.map((o) => <OrderTile key={o.id} order={o} now={now} />)}
                </div>
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* READY */}
        <div className="flex flex-col md:w-80">
          {/* Counter */}
          <div className="flex flex-col border-b border-white/10">
            <div className="border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-green-400" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Counter</h2>
                <span className="ml-auto rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs font-bold text-green-400">{readyCounter.length}</span>
              </div>
            </div>
            <div className="p-3">
              {readyCounter.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-600">—</p>
              ) : (
                <AnimatePresence mode="popLayout">
                  <div className="grid grid-cols-3 gap-2">
                    {readyCounter.map((o) => <OrderTile key={o.id} order={o} now={now} />)}
                  </div>
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Drive-Through */}
          <div className="flex flex-col">
            <div className="border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-yellow-400" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Drive-Through</h2>
                <span className="ml-auto rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-bold text-yellow-400">{readyDT.length}</span>
              </div>
            </div>
            <div className="p-3">
              {readyDT.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-600">—</p>
              ) : (
                <AnimatePresence mode="popLayout">
                  <div className="grid grid-cols-3 gap-2">
                    {readyDT.map((o) => <OrderTile key={o.id} order={o} now={now} />)}
                  </div>
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
