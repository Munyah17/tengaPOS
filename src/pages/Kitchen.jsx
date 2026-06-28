import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChefHat, Clock, CheckCircle, Timer, Flame, Volume2, VolumeX, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'

const initialOrders = [
  { id: 'ORD-001', items: ['Sadza & Beef Stew', 'Coke 330ml'], status: 'received', startedAt: Date.now() - 2 * 60000, table: 'Table 4', urgent: false },
  { id: 'ORD-002', items: ['T-Bone Steak', 'Caesar Salad', 'Water 500ml'], status: 'cooking', startedAt: Date.now() - 8 * 60000, table: 'Table 1', urgent: false },
  { id: 'ORD-003', items: ['Fish & Chips', 'Mushroom Soup'], status: 'waiting', startedAt: Date.now() - 5 * 60000, table: 'Table 7', urgent: true },
  { id: 'ORD-004', items: ['Sadza & Chicken x2', 'Fanta x2'], status: 'ready', startedAt: Date.now() - 15 * 60000, table: 'Table 2', urgent: false },
  { id: 'ORD-005', items: ['Ice Cream Sundae', 'Chocolate Brownie'], status: 'received', startedAt: Date.now() - 60000, table: 'Table 5', urgent: false },
  { id: 'ORD-006', items: ['Caesar Salad', 'Water 500ml'], status: 'cooking', startedAt: Date.now() - 10 * 60000, table: 'Table 3', urgent: false },
]

const statusConfig = {
  received: { label: 'New Order', color: 'bg-blue-500', ring: 'ring-blue-300 dark:ring-blue-700', bg: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800', icon: Clock, btn: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white', next: 'Accept' },
  waiting:  { label: 'Waiting',   color: 'bg-yellow-500', ring: 'ring-yellow-300 dark:ring-yellow-700', bg: 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-200 dark:border-yellow-800', icon: Timer, btn: 'bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white', next: 'Start Cooking' },
  cooking:  { label: 'Cooking',   color: 'bg-orange-500', ring: 'ring-orange-300 dark:ring-orange-700', bg: 'bg-orange-50 dark:bg-orange-950/50 border-orange-200 dark:border-orange-800', icon: Flame, btn: 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white', next: 'Mark Ready' },
  ready:    { label: 'Ready',     color: 'bg-green-500', ring: 'ring-green-300 dark:ring-green-700', bg: 'bg-green-50 dark:bg-green-950/50 border-green-200 dark:border-green-800', icon: CheckCircle, btn: 'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white', next: 'Complete & Clear' },
}

const statusFlow = ['received', 'waiting', 'cooking', 'ready']

function useElapsedTime(startedAt) {
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startedAt) / 1000))
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 10000)
    return () => clearInterval(t)
  }, [startedAt])
  if (elapsed < 60) return `${elapsed}s`
  const m = Math.floor(elapsed / 60)
  return `${m}m`
}

function OrderCard({ order, config, onAdvance, onComplete }) {
  const elapsed = useElapsedTime(order.startedAt)
  const isOverdue = (Date.now() - order.startedAt) > 20 * 60000
  const Icon = config.icon

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className={`select-none rounded-2xl border-2 p-4 touch-manipulation ${config.bg} ${order.urgent || isOverdue ? `ring-2 ${config.ring}` : ''}`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-slate-900 dark:text-white">{order.table}</span>
            {(order.urgent || isOverdue) && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Urgent
              </span>
            )}
          </div>
          <span className="text-xs font-mono text-slate-500">{order.id}</span>
        </div>
        <div className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold ${isOverdue ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' : 'bg-white/60 text-slate-600 dark:bg-black/20 dark:text-slate-300'}`}>
          <Clock className="h-3 w-3" />
          {elapsed}
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

      {/* Action button — large touch target */}
      <button
        onTouchEnd={(e) => { e.preventDefault(); order.status === 'ready' ? onComplete(order.id) : onAdvance(order.id) }}
        onClick={() => order.status === 'ready' ? onComplete(order.id) : onAdvance(order.id)}
        className={`flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold transition-colors ${config.btn}`}
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
    const play = (freq, start, duration) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.25, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }
    play(880, 0, 0.12)
    play(880, 0.18, 0.12)
    play(1100, 0.36, 0.18)
  } catch {}
}

export default function Kitchen() {
  const [orders, setOrders] = useState(initialOrders)
  const [soundOn, setSoundOn] = useState(true)
  const [tick, setTick] = useState(0)
  const prevCountRef = useRef(orders.length)
  const soundOnRef = useRef(soundOn)
  soundOnRef.current = soundOn

  // Simulate new order every 20s for demo
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 20000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const newCount = orders.length
    if (newCount > prevCountRef.current && soundOnRef.current) playBeep()
    prevCountRef.current = newCount
  }, [orders])

  const advanceOrder = useCallback((orderId) => {
    setOrders((prev) => prev.map((o) => {
      if (o.id !== orderId) return o
      const idx = statusFlow.indexOf(o.status)
      return idx < statusFlow.length - 1 ? { ...o, status: statusFlow[idx + 1] } : o
    }))
  }, [])

  const completeOrder = useCallback((orderId) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      {/* Header bar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-green-100 p-2 dark:bg-green-900/40">
            <ChefHat className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">Kitchen Display</h1>
            <p className="text-xs text-slate-500">{orders.length} active order{orders.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSoundOn((s) => !s); if (!soundOn) playBeep() }}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${soundOn ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {soundOn ? 'Sound on' : 'Muted'}
          </button>
          <Link
            to="/dining"
            target="_blank"
            className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Dining Screen
          </Link>
        </div>
      </div>

      {/* Board */}
      <div className="flex flex-1 gap-4 overflow-x-auto overflow-y-hidden p-4">
        {statusFlow.map((status) => {
          const config = statusConfig[status]
          const col = orders.filter((o) => o.status === status)
          return (
            <div key={status} className="flex w-72 flex-shrink-0 flex-col lg:w-auto lg:flex-1">
              {/* Column header */}
              <div className="mb-3 flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${config.color}`} />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">{config.label}</h3>
                <span className="ml-auto rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {col.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 space-y-3 overflow-y-auto pb-2 pr-1">
                <AnimatePresence>
                  {col.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      config={config}
                      onAdvance={advanceOrder}
                      onComplete={completeOrder}
                    />
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
