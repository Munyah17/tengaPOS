import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChefHat, Clock, CheckCircle, Flame, Timer, Utensils } from 'lucide-react'

// Simulated live orders — in production this would come from Supabase realtime
const INITIAL_ORDERS = [
  {
    id: 'ORD-001',
    table: 'Table 4',
    stages: [
      { label: 'Order Received', status: 'done', at: Date.now() - 14 * 60000 },
      { label: 'Accepted by Kitchen', status: 'done', at: Date.now() - 12 * 60000 },
      { label: 'Cooking', status: 'active', at: Date.now() - 10 * 60000 },
      { label: 'Ready to Serve', status: 'pending', at: null },
    ],
  },
  {
    id: 'ORD-002',
    table: 'Table 1',
    stages: [
      { label: 'Order Received', status: 'done', at: Date.now() - 22 * 60000 },
      { label: 'Accepted by Kitchen', status: 'done', at: Date.now() - 20 * 60000 },
      { label: 'Cooking', status: 'done', at: Date.now() - 15 * 60000 },
      { label: 'Ready to Serve', status: 'active', at: Date.now() - 2 * 60000 },
    ],
  },
  {
    id: 'ORD-003',
    table: 'Table 7',
    stages: [
      { label: 'Order Received', status: 'done', at: Date.now() - 5 * 60000 },
      { label: 'Accepted by Kitchen', status: 'done', at: Date.now() - 4 * 60000 },
      { label: 'Cooking', status: 'pending', at: null },
      { label: 'Ready to Serve', status: 'pending', at: null },
    ],
  },
  {
    id: 'ORD-005',
    table: 'Table 5',
    stages: [
      { label: 'Order Received', status: 'done', at: Date.now() - 60000 },
      { label: 'Accepted by Kitchen', status: 'pending', at: null },
      { label: 'Cooking', status: 'pending', at: null },
      { label: 'Ready to Serve', status: 'pending', at: null },
    ],
  },
]

const STAGE_ICONS = [Clock, Timer, Flame, CheckCircle]

function elapsed(ms) {
  if (!ms) return null
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m`
}

function StageBar({ stages }) {
  const activeIdx = stages.findIndex((s) => s.status === 'active')
  const doneCount = stages.filter((s) => s.status === 'done').length
  const progress = activeIdx >= 0 ? activeIdx : doneCount === stages.length ? stages.length : doneCount

  return (
    <div className="mt-4">
      {/* Progress line */}
      <div className="relative mb-3">
        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
          <motion.div
            className="h-1.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
            initial={{ width: 0 }}
            animate={{ width: `${(progress / (stages.length - 1)) * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Stage steps */}
      <div className="grid grid-cols-4 gap-1">
        {stages.map((stage, i) => {
          const Icon = STAGE_ICONS[i]
          const isDone = stage.status === 'done'
          const isActive = stage.status === 'active'
          const el = elapsed(stage.at)
          return (
            <div key={i} className="flex flex-col items-center gap-1 text-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${
                isDone ? 'border-green-500 bg-green-500 text-white' :
                isActive ? 'border-orange-500 bg-orange-500 text-white' :
                'border-slate-300 bg-white text-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-600'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`text-[11px] font-semibold leading-tight ${
                isDone ? 'text-green-600 dark:text-green-400' :
                isActive ? 'text-orange-600 dark:text-orange-400' :
                'text-slate-400'
              }`}>
                {stage.label}
              </span>
              {el && (
                <span className={`text-[10px] font-mono ${isDone ? 'text-green-500' : isActive ? 'text-orange-500 font-bold' : 'text-slate-400'}`}>
                  {el}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OrderCard({ order }) {
  const activeStage = order.stages.find((s) => s.status === 'active')
  const isReady = order.stages[order.stages.length - 1].status === 'active' || order.stages[order.stages.length - 1].status === 'done'
  const totalElapsed = elapsed(order.stages[0].at)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border-2 p-5 ${
        isReady
          ? 'border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-950/30'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">{order.table}</h3>
          <p className="text-xs font-mono text-slate-400">{order.id}</p>
        </div>
        <div className="text-right">
          {isReady ? (
            <span className="rounded-full bg-green-500 px-3 py-1 text-sm font-bold text-white">
              Ready to Serve! 🍽️
            </span>
          ) : (
            <span className="text-xs text-slate-500">Total wait: <span className="font-bold">{totalElapsed}</span></span>
          )}
        </div>
      </div>

      {activeStage && !isReady && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Currently: <span className="font-semibold text-orange-600 dark:text-orange-400">{activeStage.label}</span>
          {elapsed(activeStage.at) && <span className="ml-1 text-xs text-slate-400">(for {elapsed(activeStage.at)})</span>}
        </p>
      )}

      <StageBar stages={order.stages} />
    </motion.div>
  )
}

export default function Dining() {
  const [orders, setOrders] = useState(INITIAL_ORDERS)
  const [now, setNow] = useState(Date.now())

  // Refresh clock every 30s for elapsed time accuracy
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const readyOrders = orders.filter((o) => o.stages[o.stages.length - 1].status === 'active')
  const inProgressOrders = orders.filter((o) => o.stages[o.stages.length - 1].status !== 'active')

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-green-100 p-2.5 dark:bg-green-900/40">
              <Utensils className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Order Status</h1>
              <p className="text-xs text-slate-500">Live order tracker — refreshes automatically</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Live
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        {/* Ready orders callout */}
        <AnimatePresence>
          {readyOrders.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 rounded-2xl border-2 border-green-400 bg-green-50 p-4 dark:border-green-600 dark:bg-green-950/30"
            >
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 flex-shrink-0 text-green-600 dark:text-green-400" />
                <div>
                  <p className="font-extrabold text-green-800 dark:text-green-300">
                    {readyOrders.map((o) => o.table).join(', ')} — Your order is ready!
                  </p>
                  <p className="text-sm text-green-700 dark:text-green-400">Please notify your waiter or proceed to collect.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* All orders */}
        {orders.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-400">
            <ChefHat className="h-12 w-12 opacity-20" />
            <p className="text-sm">No active orders</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <AnimatePresence>
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </AnimatePresence>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          If your order has been waiting longer than expected, please notify your waiter or inform our till staff.
        </p>
      </div>
    </div>
  )
}
