import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Car, Store, ChefHat, Clock } from 'lucide-react'

// Simulated live order board — in production: Supabase realtime subscription
const SEED_ORDERS = [
  { id: '#047', status: 'preparing', orderType: 'counter',       readySince: null },
  { id: '#048', status: 'preparing', orderType: 'drive_through', readySince: null },
  { id: '#049', status: 'preparing', orderType: 'counter',       readySince: null },
  { id: '#050', status: 'ready',     orderType: 'drive_through', readySince: Date.now() - 90000 },
  { id: '#051', status: 'ready',     orderType: 'counter',       readySince: Date.now() - 30000 },
  { id: '#052', status: 'ready',     orderType: 'counter',       readySince: Date.now() - 180000 },
  { id: '#053', status: 'preparing', orderType: 'drive_through', readySince: null },
]

function waitLabel(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function OrderTile({ order, now }) {
  const isDT = order.orderType === 'drive_through'
  const isReady = order.status === 'ready'
  const waited = order.readySince ? now - order.readySince : null

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
      {/* DT car icon top-right */}
      {isDT && (
        <Car className={`absolute right-2 top-2 h-4 w-4 opacity-60 ${isReady ? 'text-yellow-800' : 'text-slate-400'}`} />
      )}
      <span className={`font-extrabold leading-none ${isReady ? 'text-4xl' : 'text-3xl'}`}>
        {order.id}
      </span>
      {isReady && waited && (
        <span className={`mt-1 text-xs font-semibold opacity-80`}>
          {waitLabel(waited)}
        </span>
      )}
    </motion.div>
  )
}

export default function Dining() {
  const [orders, setOrders] = useState(SEED_ORDERS)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])

  const preparing = orders.filter((o) => o.status === 'preparing')
  const readyCounter = orders.filter((o) => o.status === 'ready' && o.orderType === 'counter')
  const readyDT = orders.filter((o) => o.status === 'ready' && o.orderType === 'drive_through')

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 bg-slate-900 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-green-500/20 p-2">
            <ChefHat className="h-6 w-6 text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold">Order Status Board</h1>
            <p className="text-xs text-slate-400">Your number will appear in <span className="font-semibold text-green-400">Ready</span> when your order is done</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 px-3 py-1.5 text-xs font-semibold text-green-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
          Live
        </div>
      </div>

      {/* Board */}
      <div className="flex flex-1 flex-col gap-0 overflow-hidden md:flex-row">

        {/* LEFT — Preparing */}
        <div className="flex flex-1 flex-col border-b border-white/10 md:border-b-0 md:border-r">
          <div className="flex items-center gap-3 bg-slate-800/60 px-6 py-4">
            <Clock className="h-5 w-5 text-orange-400" />
            <h2 className="text-xl font-extrabold tracking-wide text-white">PREPARING</h2>
            <span className="ml-auto rounded-full bg-orange-500/20 px-3 py-1 text-sm font-bold text-orange-400">
              {preparing.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {preparing.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-slate-600 text-sm">No orders preparing</div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                <AnimatePresence>
                  {preparing.map((o) => <OrderTile key={o.id} order={o} now={now} />)}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Ready */}
        <div className="flex flex-1 flex-col">
          {/* Counter collection */}
          <div className="flex flex-1 flex-col border-b border-white/10">
            <div className="flex items-center gap-3 bg-green-900/30 px-6 py-4">
              <Store className="h-5 w-5 text-green-400" />
              <h2 className="text-xl font-extrabold tracking-wide text-white">READY — COUNTER</h2>
              <span className="ml-auto rounded-full bg-green-500/20 px-3 py-1 text-sm font-bold text-green-400">
                {readyCounter.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {readyCounter.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-slate-600 text-sm">No orders ready</div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  <AnimatePresence>
                    {readyCounter.map((o) => <OrderTile key={o.id} order={o} now={now} />)}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          {/* Drive-through collection */}
          <div className="flex flex-1 flex-col">
            <div className="flex items-center gap-3 bg-yellow-900/30 px-6 py-4">
              <Car className="h-5 w-5 text-yellow-400" />
              <h2 className="text-xl font-extrabold tracking-wide text-white">READY — DRIVE-THROUGH</h2>
              <span className="ml-auto rounded-full bg-yellow-500/20 px-3 py-1 text-sm font-bold text-yellow-400">
                {readyDT.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {readyDT.length === 0 ? (
                <div className="flex h-24 items-center justify-center text-slate-600 text-sm">No drive-through orders ready</div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  <AnimatePresence>
                    {readyDT.map((o) => <OrderTile key={o.id} order={o} now={now} />)}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer legend */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-center gap-6 border-t border-white/10 bg-slate-900 px-6 py-3 text-xs text-slate-400">
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-700" /> Preparing</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-green-500" /> Counter ready</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-yellow-400" /> Drive-through ready</span>
        <span className="flex items-center gap-2"><Car className="h-3.5 w-3.5" /> = Drive-through order</span>
      </div>
    </div>
  )
}
