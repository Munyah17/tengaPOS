import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChefHat, Clock, CheckCircle, Timer, Flame, Volume2, VolumeX, ExternalLink, Car, Store } from 'lucide-react'
import { Link } from 'react-router-dom'

const initialOrders = [
  { id: '#047', items: ['Zinger Burger x2', 'Large Fries', 'Coke 500ml'], status: 'received', startedAt: Date.now() - 2 * 60000, orderType: 'counter' },
  { id: '#048', items: ['Streetwise 2', 'Coleslaw'], status: 'cooking', startedAt: Date.now() - 8 * 60000, orderType: 'drive_through' },
  { id: '#049', items: ['Grilled Chicken Wrap', 'Water 500ml'], status: 'waiting', startedAt: Date.now() - 5 * 60000, orderType: 'counter' },
  { id: '#050', items: ['Family Bucket x1', 'Chips x3', 'Fanta x3'], status: 'ready', startedAt: Date.now() - 15 * 60000, orderType: 'drive_through' },
  { id: '#051', items: ['Double Smash Burger'], status: 'received', startedAt: Date.now() - 60000, orderType: 'counter' },
  { id: '#052', items: ['Veggie Wrap', 'Juice 300ml'], status: 'cooking', startedAt: Date.now() - 10 * 60000, orderType: 'drive_through' },
]

const statusConfig = {
  received: { label: 'New',     color: 'bg-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800',     icon: Clock,       btn: 'bg-blue-600 hover:bg-blue-700 text-white',   next: 'Accept' },
  waiting:  { label: 'Waiting', color: 'bg-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800', icon: Timer,    btn: 'bg-yellow-600 hover:bg-yellow-700 text-white', next: 'Start Cooking' },
  cooking:  { label: 'Cooking', color: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800', icon: Flame,    btn: 'bg-orange-600 hover:bg-orange-700 text-white', next: 'Mark Ready' },
  ready:    { label: 'Ready',   color: 'bg-green-500',  bg: 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800',   icon: CheckCircle, btn: 'bg-green-600 hover:bg-green-700 text-white',  next: 'Complete' },
}

const statusFlow = ['received', 'waiting', 'cooking', 'ready']

function useElapsed(startedAt) {
  const [val, setVal] = useState(Math.floor((Date.now() - startedAt) / 1000))
  useEffect(() => {
    const t = setInterval(() => setVal(Math.floor((Date.now() - startedAt) / 1000)), 10000)
    return () => clearInterval(t)
  }, [startedAt])
  return val < 60 ? `${val}s` : `${Math.floor(val / 60)}m`
}

function OrderCard({ order, config, onAdvance, onComplete }) {
  const elapsed = useElapsed(order.startedAt)
  const isOverdue = Date.now() - order.startedAt > 20 * 60000
  const isDT = order.orderType === 'drive_through'
  const Icon = config.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`select-none rounded-2xl border-2 p-4 touch-manipulation ${config.bg} ${isOverdue ? 'ring-2 ring-red-400 dark:ring-red-600' : ''}`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-slate-900 dark:text-white">{order.id}</span>
            {/* Order type badge */}
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              isDT
                ? 'bg-yellow-400 text-yellow-900'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
            }`}>
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

      {/* Items */}
      <ul className="mb-4 space-y-1.5">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-40" />
            {item}
          </li>
        ))}
      </ul>

      {/* Action */}
      <button
        onTouchEnd={(e) => { e.preventDefault(); order.status === 'ready' ? onComplete(order.id) : onAdvance(order.id) }}
        onClick={() => order.status === 'ready' ? onComplete(order.id) : onAdvance(order.id)}
        className={`flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold transition-colors active:scale-95 ${config.btn}`}
      >
        <Icon className="h-4 w-4" />
        {config.next}
      </button>
    </motion.div>
  )
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

export default function Kitchen() {
  const [orders, setOrders] = useState(initialOrders)
  const [soundOn, setSoundOn] = useState(true)
  const [filter, setFilter] = useState('all')
  const prevCountRef = useRef(orders.length)
  const soundOnRef = useRef(soundOn)
  soundOnRef.current = soundOn

  useEffect(() => {
    if (orders.length > prevCountRef.current && soundOnRef.current) playBeep()
    prevCountRef.current = orders.length
  }, [orders.length])

  const advanceOrder = useCallback((id) => {
    setOrders((prev) => prev.map((o) => {
      if (o.id !== id) return o
      const idx = statusFlow.indexOf(o.status)
      return idx < statusFlow.length - 1 ? { ...o, status: statusFlow[idx + 1] } : o
    }))
  }, [])

  const completeOrder = useCallback((id) => setOrders((prev) => prev.filter((o) => o.id !== id)), [])

  const visibleOrders = filter === 'all' ? orders : orders.filter((o) => o.orderType === filter)

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
            <p className="text-xs text-slate-500">{orders.length} active order{orders.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Filter */}
          <div className="flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            {[{ id: 'all', label: 'All' }, { id: 'counter', label: 'Counter', icon: Store }, { id: 'drive_through', label: 'Drive-Through', icon: Car }].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f.id
                    ? f.id === 'drive_through' ? 'bg-yellow-500 text-white' : 'bg-green-600 text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {f.icon && <f.icon className="h-3.5 w-3.5" />}
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setSoundOn((s) => !s); if (!soundOn) playBeep() }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${soundOn ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {soundOn ? 'Sound on' : 'Muted'}
          </button>
          <Link
            to="/dining"
            target="_blank"
            className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Dining Board
          </Link>
        </div>
      </div>

      {/* Board */}
      <div className="flex flex-1 gap-4 overflow-x-auto overflow-y-hidden p-4">
        {statusFlow.map((status) => {
          const config = statusConfig[status]
          const col = visibleOrders.filter((o) => o.status === status)
          return (
            <div key={status} className="flex w-72 flex-shrink-0 flex-col lg:w-auto lg:flex-1">
              <div className="mb-3 flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${config.color}`} />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">{config.label}</h3>
                <span className="ml-auto rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{col.length}</span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto pb-2 pr-1">
                <AnimatePresence>
                  {col.map((order) => (
                    <OrderCard key={order.id} order={order} config={config} onAdvance={advanceOrder} onComplete={completeOrder} />
                  ))}
                </AnimatePresence>
                {col.length === 0 && (
                  <div className="flex h-24 items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <span className="text-xs text-slate-400">Empty</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
