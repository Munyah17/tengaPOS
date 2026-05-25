import { create } from 'zustand'

export const useCartStore = create((set, get) => ({
  items: [],
  paymentMethod: 'cash',
  discount: 0,
  customerId: null,

  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.id === product.id)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      return { items: [...state.items, { ...product, quantity: 1, itemDiscount: 0 }] }
    }),

  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== productId) })),

  updateQuantity: (productId, quantity) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === productId ? { ...i, quantity: Math.max(0, quantity) } : i
      ).filter((i) => i.quantity > 0),
    })),

  setItemDiscount: (productId, discount) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === productId ? { ...i, itemDiscount: discount } : i
      ),
    })),

  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setDiscount: (discount) => set({ discount }),
  setCustomerId: (customerId) => set({ customerId }),

  getSubtotal: () => {
    const { items } = get()
    return items.reduce(
      (sum, item) => sum + item.price * item.quantity * (1 - (item.itemDiscount || 0) / 100),
      0
    )
  },

  getTotal: () => {
    const { discount } = get()
    const subtotal = get().getSubtotal()
    return subtotal * (1 - discount / 100)
  },

  getTax: () => {
    return get().getTotal() * 0.15
  },

  getGrandTotal: () => {
    return get().getTotal() + get().getTax()
  },

  clearCart: () => set({ items: [], discount: 0, customerId: null }),
}))
