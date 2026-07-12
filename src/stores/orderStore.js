import { create } from 'zustand'

let _num = 52
const nextNumber = () => String(++_num).padStart(3, '0')

const STATUS_FLOW = ['received', 'waiting', 'cooking', 'ready']

export const useOrderStore = create((set) => ({
  orders: [],

  reset() {
    set({ orders: [] })
  },

  addOrder(items, type = 'counter') {
    set((s) => ({
      orders: [
        { id: `ord-${Date.now()}`, number: nextNumber(), type, status: 'received', startedAt: Date.now(), readyAt: null, items },
        ...s.orders,
      ],
    }))
  },

  advance(id) {
    set((s) => ({
      orders: s.orders.map((o) => {
        if (o.id !== id) return o
        const i = STATUS_FLOW.indexOf(o.status)
        const next = STATUS_FLOW[Math.min(i + 1, STATUS_FLOW.length - 1)]
        return { ...o, status: next, ...(next === 'ready' ? { readyAt: Date.now() } : {}) }
      }),
    }))
  },

  complete(id) {
    set((s) => ({ orders: s.orders.filter((o) => o.id !== id) }))
  },
}))
