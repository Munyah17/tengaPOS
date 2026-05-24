import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChefHat, Clock, CheckCircle, Timer, Flame } from 'lucide-react'
import Button from '@/components/common/Button'

const initialOrders = [
  { id: 'ORD-001', items: ['Sadza & Beef Stew', 'Coke 330ml'], status: 'received', time: '2 min ago', table: 'Table 4' },
  { id: 'ORD-002', items: ['T-Bone Steak', 'Caesar Salad', 'Water 500ml'], status: 'cooking', time: '8 min ago', table: 'Table 1' },
  { id: 'ORD-003', items: ['Fish & Chips', 'Mushroom Soup'], status: 'waiting', time: '5 min ago', table: 'Table 7' },
  { id: 'ORD-004', items: ['Sadza & Chicken x2', 'Fanta x2'], status: 'ready', time: '15 min ago', table: 'Table 2' },
  { id: 'ORD-005', items: ['Ice Cream Sundae', 'Chocolate Brownie'], status: 'received', time: '1 min ago', table: 'Table 5' },
  { id: 'ORD-006', items: ['Caesar Salad', 'Water 500ml'], status: 'cooking', time: '10 min ago', table: 'Table 3' },
]

const statusConfig = {
  received: { label: 'Received', color: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800', icon: Clock },
  waiting: { label: 'Waiting', color: 'bg-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800', icon: Timer },
  cooking: { label: 'Cooking', color: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800', icon: Flame },
  ready: { label: 'Ready', color: 'bg-green-500', bg: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800', icon: CheckCircle },
}

const statusFlow = ['received', 'waiting', 'cooking', 'ready']

export default function Kitchen() {
  const [orders, setOrders] = useState(initialOrders)

  const advanceOrder = (orderId) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order
        const currentIdx = statusFlow.indexOf(order.status)
        if (currentIdx < statusFlow.length - 1) {
          return { ...order, status: statusFlow[currentIdx + 1] }
        }
        return order
      })
    )
  }

  const completeOrder = (orderId) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-xl bg-restaurant-100 p-2 dark:bg-restaurant-900">
          <ChefHat className="h-5 w-5 text-restaurant-600 dark:text-restaurant-400" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Kitchen Display</h1>
          <p className="text-sm text-slate-500">Real-time order queue</p>
        </div>
      </div>

      {/* Status columns */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statusFlow.map((status) => {
          const config = statusConfig[status]
          const statusOrders = orders.filter((o) => o.status === status)
          return (
            <div key={status}>
              <div className="mb-3 flex items-center gap-2">
                <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{config.label}</h3>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {statusOrders.length}
                </span>
              </div>
              <div className="space-y-3">
                <AnimatePresence>
                  {statusOrders.map((order) => {
                    const Icon = config.icon
                    return (
                      <motion.div
                        key={order.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`rounded-xl border p-4 ${config.bg}`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {order.id}
                          </span>
                          <Icon className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                          {order.table}
                        </div>
                        <div className="mb-3 space-y-1">
                          {order.items.map((item, i) => (
                            <div key={i} className="text-sm text-slate-700 dark:text-slate-300">
                              • {item}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">{order.time}</span>
                          {status === 'ready' ? (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => completeOrder(order.id)}
                            >
                              Complete
                            </Button>
                          ) : (
                            <Button
                              variant="restaurant"
                              size="sm"
                              onClick={() => advanceOrder(order.id)}
                            >
                              Next →
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
