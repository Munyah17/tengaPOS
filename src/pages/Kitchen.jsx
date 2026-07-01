import { useEffect, useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChefHat, Clock, CheckCircle, Timer, Flame, Volume2, VolumeX, Car, Store } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useOrderStore } from '@/stores/orderStore'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { fetchKitchenOrders, advanceKitchenOrder, completeKitchenOrder } from '@/lib/db'

const STATUS_CFG = {
  received: { label: 'New',     color: 'bg-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800',         icon: Clock,       btn: 'bg-blue-600 hover:bg-blue-700 text-white',    next: 'Accept' },
  waiting:  { label: 'Waiting', color: 'bg-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800',   icon: Timer,       btn: 'bg-yellow-600 hover:bg-yellow-700 text-white', next: 'Start Cooking' },
  cooking:  { label: 'Cooking', color: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800',   icon: Flame,       btn: 'bg-orange-600 hover:bg-orange-700 text-white', next: 'Mark Ready' },
  ready:    { label: 'Ready',   color: 'bg-green-500',  bg: 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800',       icon: CheckCircle, btn: 'bg-green-600 hover:bg-green-700 text-white',  next: 'Complete' },
}

const STATUS_FLOW = ['received', 'waiting', 'cooking', 'ready']

function useElapsed(startedAt) {
  const [val, setVal] = useState(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
  useEffect(() => {
    const t = setInterval(() => setVal(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)), 10000)
    return () => clearInterval(t)
  }, [startedAt])
  return val < 60 ? `${val}s` : `${Math.floor(val / 60)}m`
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const play = (freq, start, dur) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'square'; osc.frequency.value = freq
      gain.gain.setValueAtTime(0.25, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur)
    }
    play(880, 0, 0.12); play(880, 0.18, 0.12); play(1100, 0.36, 0.18)
  } catch {}
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onAdvance, onComplete }) {
  const cfg = STATUS_CFG[order.status] || STATUS_CFG.received
  const startedAt = order.startedAt || order.created_at
  const elapsed = useElapsed(startedAt)
  const isOverdue = Date.now() - new Date(startedAt).getTime() > 20 * 60000
  const isDT = order.type === 'drive_through'
  const Icon = cfg.icon

  const items = order.items || order.order_items || []

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`select-none rounded-2xl border-2 p-4 touch-manipulation ${cfg.bg} ${isOverdue ? 'ring-2 ring-red-400 dark:ring-red-600' : ''}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-slate-900 dark:text-white">
              #{order.number || order.order_no}
            </span>
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isDT ? 'bg-yellow-400 text-yellow-900' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'}`}>
              {isDT ? <Car className="h-3 w-3" /> : <Store className="h-3 w-3" />}
              {isDT ? 'DT' : 'Counter'}
            </span>
          </div>
          {isOverdue && <span className="mt-0.5 inline-block rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Overdue</span>}
        </div>
        <div className={`flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-bold ${isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' : 'bg-white/60 text-slate-600 dark:bg-black/20 dark:text-slate-300'}`}>
          <Clock className="h-3 w-3" />{elapsed}
        </div>
      </div>

      <ul className="mb-4 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-40" />
            {(item.qty || item.quantity) > 1 ? `${item.qty || item.quantity}× ` : ''}{item.name}
          </li>
        ))}
      </ul>

      <button
        onTouchEnd={e => { e.preventDefault(); order.status === 'ready' ? onComplete(order.id) : onAdvance(order.id) }}
        onClick={() => order.status === 'ready' ? onComplete(order.id) : onAdvance(order.id)}
        className={`flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold transition-colors active:scale-95 ${cfg.btn}`}
      >
        <Icon className="h-4 w-4" />
        {cfg.next}
      </button>
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Kitchen() {
  const demoStore = useOrderStore()
  const { isDemo, tenant } = useAuthStore()
  const [liveOrders, setLiveOrders] = useState([])
  const [soundOn, setSoundOn] = useState(true)
  const [filter, setFilter] = useState('all')
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn

  // Demo mode: use in-memory order store
  useEffect(() => {
    if (isDemo) demoStore.seedDemo()
  }, [isDemo])

  // Real mode: load from DB + subscribe to Realtime changes
  useEffect(() => {
    if (isDemo || !tenant?.id) return

    fetchKitchenOrders(tenant.id).then(setLiveOrders).catch(() => {})

    const channel = supabase
      .channel(`kitchen-${tenant.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `tenant_id=eq.${tenant.id}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          if (payload.new.pos_mode !== 'restaurant') return
          // Fetch full order with items
          supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('id', payload.new.id)
            .single()
            .then(({ data }) => {
              if (data) {
                setLiveOrders(prev => {
                  if (soundRef.current) playBeep()
                  return [data, ...prev]
                })
              }
            })
        } else if (payload.eventType === 'UPDATE') {
          setLiveOrders(prev => {
            if (payload.new.status === 'completed' || payload.new.status === 'cancelled') {
              return prev.filter(o => o.id !== payload.new.id)
            }
            return prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o)
          })
        } else if (payload.eventType === 'DELETE') {
          setLiveOrders(prev => prev.filter(o => o.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isDemo, tenant?.id])

  const orders = isDemo ? demoStore.orders : liveOrders
  const prevLen = useRef(orders.length)
  useEffect(() => {
    if (!isDemo && orders.length > prevLen.current && soundRef.current) playBeep()
    prevLen.current = orders.length
  }, [orders.length])

  const handleAdvance = async (id) => {
    if (isDemo) { demoStore.advance(id); return }
    const order = liveOrders.find(o => o.id === id)
    if (!order) return
    const idx = STATUS_FLOW.indexOf(order.status)
    const next = STATUS_FLOW[Math.min(idx + 1, STATUS_FLOW.length - 1)]
    setLiveOrders(prev => prev.map(o => o.id === id ? { ...o, status: next } : o))
    await advanceKitchenOrder(id, next).catch(() => {})
  }

  const handleComplete = async (id) => {
    if (isDemo) { demoStore.complete(id); return }
    setLiveOrders(prev => prev.filter(o => o.id !== id))
    await completeKitchenOrder(id).catch(() => {})
  }

  const visible = filter === 'all' ? orders : orders.filter(o => o.type === filter)
  const activeCount = orders.filter(o => o.status !== 'ready').length

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-green-100 p-2 dark:bg-green-900/40">
            <ChefHat className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">Kitchen Display</h1>
            <p className="text-xs text-slate-500">{activeCount} active · {orders.filter(o => o.status === 'ready').length} ready</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            {[{ id: 'all', label: 'All' }, { id: 'counter', label: 'Counter', icon: Store }, { id: 'drive_through', label: 'Drive-Through', icon: Car }].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${filter === f.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {f.icon && <f.icon className="h-3.5 w-3.5" />}{f.label}
              </button>
            ))}
          </div>

          <Link to="/dining" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
            <Store className="h-3.5 w-3.5" />
            Dining Board ↗
          </Link>

          <button
            onClick={() => setSoundOn(v => !v)}
            className={`rounded-xl p-2 transition-colors ${soundOn ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-shrink-0 flex-wrap gap-2 border-b border-slate-100 bg-white px-5 py-2 dark:border-slate-800/50 dark:bg-slate-950">
        {Object.entries(STATUS_CFG).map(([key, cfg]) => (
          <span key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`h-2 w-2 rounded-full ${cfg.color}`} />
            {cfg.label} ({orders.filter(o => o.status === key).length})
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <ChefHat className="mb-3 h-12 w-12 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-500">No active orders</p>
            <p className="mt-1 text-xs text-slate-400">New orders from POS will appear here automatically</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onAdvance={handleAdvance}
                  onComplete={handleComplete}
                />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
