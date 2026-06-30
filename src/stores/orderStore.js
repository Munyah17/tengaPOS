import { create } from 'zustand'

let _num = 52
const nextNumber = () => String(++_num).padStart(3, '0')

const SEED = [
  { id: 'ord-1', number: '047', type: 'counter',       status: 'cooking',  startedAt: Date.now() - 12 * 60000, readyAt: null, items: [{ name: 'Zinger Burger', qty: 2, price: 8.50 }, { name: 'Large Fries', qty: 1, price: 3.00 }, { name: 'Coke 500ml', qty: 1, price: 1.50 }] },
  { id: 'ord-2', number: '048', type: 'drive_through', status: 'cooking',  startedAt: Date.now() - 8 * 60000,  readyAt: null, items: [{ name: 'Streetwise 2', qty: 1, price: 12.00 }, { name: 'Coleslaw', qty: 1, price: 2.50 }] },
  { id: 'ord-3', number: '049', type: 'counter',       status: 'received', startedAt: Date.now() - 5 * 60000,  readyAt: null, items: [{ name: 'Grilled Chicken Wrap', qty: 1, price: 10.00 }, { name: 'Water 500ml', qty: 1, price: 1.00 }] },
  { id: 'ord-4', number: '050', type: 'drive_through', status: 'ready',    startedAt: Date.now() - 25 * 60000, readyAt: Date.now() - 5 * 60000, items: [{ name: 'Family Bucket', qty: 1, price: 35.00 }, { name: 'Chips', qty: 3, price: 3.00 }, { name: 'Fanta', qty: 3, price: 1.50 }] },
  { id: 'ord-5', number: '051', type: 'counter',       status: 'ready',    startedAt: Date.now() - 18 * 60000, readyAt: Date.now() - 3 * 60000,  items: [{ name: 'Double Smash Burger', qty: 1, price: 15.00 }] },
  { id: 'ord-6', number: '052', type: 'drive_through', status: 'cooking',  startedAt: Date.now() - 10 * 60000, readyAt: null, items: [{ name: 'Veggie Wrap', qty: 1, price: 9.00 }, { name: 'Juice 300ml', qty: 1, price: 2.00 }] },
]

const STATUS_FLOW = ['received', 'waiting', 'cooking', 'ready']

export const useOrderStore = create((set, get) => ({
  orders: [],
  _seeded: false,

  seedDemo() {
    if (!get()._seeded) set({ orders: SEED, _seeded: true })
  },

  reset() {
    set({ orders: [], _seeded: false })
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
