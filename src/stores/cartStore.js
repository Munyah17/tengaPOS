import { create } from 'zustand'

export const useCartStore = create((set, get) => ({
  items: [],
  paymentMethod: 'cash',
  discount: 0,
  customerId: null,
  orderType: 'counter',
  // VAT is INCLUSIVE: the shelf price already contains VAT.
  // Set per tenant from their settings (vat_enabled / vat_rate).
  vatEnabled: true,
  vatRate: 15.5,

  setVatConfig: (enabled, rate) =>
    set({ vatEnabled: enabled !== false, vatRate: Number(rate) || 15.5 }),

  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.id === product.id)
      const stock = product.stock ?? existing?.stock
      if (existing) {
        // Never let the cart exceed available stock
        if (stock != null && stock !== 999 && existing.quantity + 1 > stock) {
          return state
        }
        return {
          items: state.items.map((i) =>
            i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        }
      }
      if (stock != null && stock !== 999 && stock < 1) {
        return state
      }
      return { items: [...state.items, { ...product, quantity: 1, itemDiscount: 0 }] }
    }),

  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== productId) })),

  updateQuantity: (productId, quantity) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (i.id !== productId) return i
        let q = Math.max(0, quantity)
        // Cap at available stock
        if (i.stock != null && i.stock !== 999 && q > i.stock) q = i.stock
        return { ...i, quantity: q }
      }).filter((i) => i.quantity > 0),
    })),

  setItemDiscount: (productId, discount) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === productId ? { ...i, itemDiscount: discount } : i
      ),
    })),

  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setOrderType: (orderType) => set({ orderType }),
  setDiscount: (discount) => set({ discount }),
  setCustomerId: (customerId) => set({ customerId }),

  // Total of shelf prices (VAT-inclusive), after discounts
  getTotal: () => {
    const { items, discount } = get()
    const gross = items.reduce(
      (sum, item) => sum + item.price * item.quantity * (1 - (item.itemDiscount || 0) / 100),
      0
    )
    return gross * (1 - discount / 100)
  },

  // VAT portion INCLUDED in the total: total × r / (100 + r).
  // e.g. $2.20 sugar at 15.5% → VAT $0.295, net $1.905. Nothing is added on top.
  getTax: () => {
    const { vatEnabled, vatRate } = get()
    if (!vatEnabled) return 0
    return get().getTotal() * (vatRate / (100 + vatRate))
  },

  // Net (ex-VAT) portion of the total
  getSubtotal: () => {
    return get().getTotal() - get().getTax()
  },

  // Customer pays exactly the shelf-price total — VAT is inside it
  getGrandTotal: () => {
    return get().getTotal()
  },

  clearCart: () => set({ items: [], discount: 0, customerId: null, orderType: 'counter' }),
}))
