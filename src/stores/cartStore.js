import { create } from 'zustand'

// Hardware Mode bulk/trade pricing: price_tiers is [{ min_qty, price }] on
// the product, highest qualifying tier wins. basePrice is the item's normal
// (untiered) price, kept alongside so re-evaluating on every quantity change
// never compounds off an already-discounted price. Products with no tiers
// (every non-Hardware-Mode tenant) always resolve straight back to basePrice.
function tieredUnitPrice(basePrice, tiers, qty) {
  if (!Array.isArray(tiers) || tiers.length === 0) return basePrice
  let price = basePrice
  for (const tier of tiers) {
    if (qty >= tier.min_qty && tier.price < price) price = tier.price
  }
  return price
}

export const useCartStore = create((set, get) => ({
  items: [],
  paymentMethod: 'cash',
  discount: 0,
  discountType: 'percent', // 'percent' | 'fixed'
  // Set once a manager authorizes a >10% discount (see POS.jsx's
  // authorization modal + authorize_discount_override RPC) -- consumed
  // server-side by process_checkout, cleared on every cart change so a
  // stale id from a previous sale can never carry over to this one.
  discountAuthId: null,
  customerId: null,
  orderType: 'counter',
  // Set when a Workshop job card is sent to POS to be paid out — after
  // checkout succeeds, POS.jsx uses this to mark that job card completed
  // and link it to the resulting order, then clears it.
  sourceJobCardId: null,
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
        const qty = existing.quantity + 1
        return {
          items: state.items.map((i) =>
            i.id === product.id ? { ...i, quantity: qty, price: tieredUnitPrice(i.basePrice, i.price_tiers, qty) } : i
          ),
        }
      }
      if (stock != null && stock !== 999 && stock < 1) {
        return state
      }
      return { items: [...state.items, { ...product, basePrice: product.price, quantity: 1, itemDiscount: 0 }] }
    }),

  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== productId) })),

  // Returns the quantity actually applied (may be less than requested if
  // capped by stock) so callers can tell the difference between "typing
  // didn't work" and "capped, here's why" instead of silently truncating.
  updateQuantity: (productId, quantity) => {
    let applied = quantity
    set((state) => ({
      items: state.items.map((i) => {
        if (i.id !== productId) return i
        let q = Math.max(0, quantity)
        // Cap at available stock
        if (i.stock != null && i.stock !== 999 && q > i.stock) q = i.stock
        applied = q
        return { ...i, quantity: q, price: tieredUnitPrice(i.basePrice, i.price_tiers, q) }
      }).filter((i) => i.quantity > 0),
    }))
    return applied
  },

  setItemDiscount: (productId, discount) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.id === productId ? { ...i, itemDiscount: discount } : i
      ),
      discountAuthId: null,
    })),

  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setOrderType: (orderType) => set({ orderType }),
  // Any discount change invalidates a previously-authorized override --
  // it was only ever valid for the % it was granted for.
  setDiscount: (discount) => set({ discount, discountAuthId: null }),
  setDiscountType: (discountType) => set({ discountType, discount: 0, discountAuthId: null }),
  setDiscountAuthId: (discountAuthId) => set({ discountAuthId }),
  setCustomerId: (customerId) => set({ customerId }),

  // Total of shelf prices (VAT-inclusive), after discounts
  getTotal: () => {
    const { items, discount, discountType } = get()
    const gross = items.reduce(
      (sum, item) => sum + item.price * item.quantity * (1 - (item.itemDiscount || 0) / 100),
      0
    )
    if (discountType === 'fixed') return Math.max(0, gross - discount)
    return gross * (1 - discount / 100)
  },

  // VAT portion INCLUDED in the total: total × r / (100 + r) — but only for
  // the share of the cart that's actually standard-rated. Zero-rated and
  // exempt products (a per-product setting, not a blanket on/off) contribute
  // no VAT at all, matching how VAT actually works (these are legally
  // distinct from "standard-rated" under the VAT Act, not just "off").
  getTax: () => {
    const { vatEnabled, vatRate, items, discount, discountType } = get()
    if (!vatEnabled) return 0

    const lineTotal = (item) => item.price * item.quantity * (1 - (item.itemDiscount || 0) / 100)
    const grossAll = items.reduce((s, i) => s + lineTotal(i), 0)
    if (grossAll === 0) return 0

    const grossTaxable = items.reduce((s, i) => {
      if (i.vat_treatment === 'zero_rated' || i.vat_treatment === 'exempt') return s
      return s + lineTotal(i)
    }, 0)
    if (grossTaxable === 0) return 0

    // A cart-level discount applies to the whole basket — prorate it across
    // the taxable and non-taxable shares by their portion of the gross total.
    const totalAfterDiscount = get().getTotal()
    const taxableShare = grossTaxable / grossAll
    const taxableAfterDiscount = totalAfterDiscount * taxableShare

    return taxableAfterDiscount * (vatRate / (100 + vatRate))
  },

  // Net (ex-VAT) portion of the total
  getSubtotal: () => {
    return get().getTotal() - get().getTax()
  },

  // Customer pays exactly the shelf-price total — VAT is inside it
  getGrandTotal: () => {
    return get().getTotal()
  },

  // Client-side estimate only, used to decide whether to show the manager
  // authorization modal before checkout is even attempted -- the server
  // (process_checkout) computes and enforces the real number from trusted
  // product prices regardless of what this returns.
  getEffectiveDiscountPct: () => {
    const { items } = get()
    const gross = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    if (gross <= 0) return 0
    return Math.max(0, ((gross - get().getTotal()) / gross) * 100)
  },

  clearCart: () => set({ items: [], discount: 0, discountType: 'percent', discountAuthId: null, customerId: null, orderType: 'counter', sourceJobCardId: null }),
}))
