import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Barcode, Plus, Minus, Trash2, ShoppingCart,
  CreditCard, Banknote, Smartphone, Receipt, X,
} from 'lucide-react'
import Button from '@/components/common/Button'
import ZimraReceipt from '@/components/common/ZimraReceipt'
import { useCartStore } from '@/stores/cartStore'
import { useThemeStore } from '@/stores/themeStore'
import { DEMO_PRODUCTS, DEMO_CATEGORIES, RESTAURANT_DEMO_PRODUCTS, PAYMENT_METHODS } from '@/utils/constants'
import { formatCurrency, generateReceiptNumber } from '@/utils/formatters'
import toast from 'react-hot-toast'

const restaurantCategories = [
  { id: 'all', name: 'All' },
  { id: 'mains', name: 'Mains' },
  { id: 'starters', name: 'Starters' },
  { id: 'drinks', name: 'Drinks' },
  { id: 'desserts', name: 'Desserts' },
]

export default function POS() {
  const { posMode } = useThemeStore()
  const isRestaurant = posMode === 'restaurant'
  const cart = useCartStore()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [showReceipt, setShowReceipt] = useState(false)
  const [receiptData, setReceiptData] = useState(null)

  const products = isRestaurant ? RESTAURANT_DEMO_PRODUCTS : DEMO_PRODUCTS
  const categories = isRestaurant ? restaurantCategories : DEMO_CATEGORIES

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.includes(search)
      const matchCategory = category === 'all' || p.category === category
      return matchSearch && matchCategory
    })
  }, [products, search, category])

  const handleCheckout = () => {
    if (cart.items.length === 0) {
      toast.error('Cart is empty')
      return
    }
    const receipt = {
      receiptNumber: generateReceiptNumber(),
      items: cart.items,
      subtotal: cart.getSubtotal(),
      tax: cart.getTax(),
      total: cart.getGrandTotal(),
      paymentMethod: cart.paymentMethod,
      date: new Date().toISOString(),
      cashier: 'Demo Cashier',
    }
    setReceiptData(receipt)
    setShowReceipt(true)
    cart.clearCart()
    toast.success('Transaction completed!')
  }

  const accent = isRestaurant ? 'restaurant' : 'brand'

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Product Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Search + Filters */}
        <div className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, SKU, or barcode..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <button className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Barcode className="h-4 w-4" />
              Scan
            </button>
          </div>
          {/* Category pills */}
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  category === cat.id
                    ? isRestaurant
                      ? 'bg-restaurant-600 text-white'
                      : 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((product) => (
              <motion.button
                key={product.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => cart.addItem(product)}
                className="group rounded-xl border border-slate-200 bg-white p-3 text-left transition-shadow hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
              >
                <div className={`mb-2 flex h-36 items-center justify-center rounded-lg ${
                  isRestaurant ? 'bg-restaurant-50 dark:bg-restaurant-950' : 'bg-brand-50 dark:bg-brand-950'
                }`}>
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full rounded-lg object-cover"
                    />
                  ) : (
                    <Package className={`h-12 w-12 ${
                      isRestaurant ? 'text-restaurant-300' : 'text-brand-300'
                    }`} />
                  )}
                </div>
                <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {product.name}
                </h4>
                {product.brand && (
                  <p className="truncate text-xs text-slate-400">{product.brand}</p>
                )}
                <div className="mt-1 flex items-center justify-between">
                  <span className={`text-lg font-extrabold ${
                    isRestaurant ? 'text-restaurant-600 dark:text-restaurant-400' : 'text-brand-600 dark:text-brand-400'
                  }`}>
                    {formatCurrency(product.price)}
                  </span>
                  <span className="text-xs text-slate-500">{product.stock} in stock</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">SKU: {product.sku}</div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart Panel */}
      <div className="flex w-96 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        {/* Cart Header */}
        <div className={`flex items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-800`}>
          <ShoppingCart className={`h-5 w-5 ${
            isRestaurant ? 'text-restaurant-600' : 'text-brand-600'
          }`} />
          <h2 className="font-bold text-slate-900 dark:text-white">
            {isRestaurant ? 'Order' : 'Cart'}
          </h2>
          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {cart.items.length} items
          </span>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-auto p-4">
          <AnimatePresence>
            {cart.items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <ShoppingCart className="mb-3 h-12 w-12 text-slate-300 dark:text-slate-700" />
                <p className="text-sm text-slate-500">
                  {isRestaurant ? 'No items in order' : 'Cart is empty'}
                </p>
                <p className="mt-1 text-xs text-slate-400">Tap a product to add it</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.items.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          {item.name}
                        </h4>
                        <p className="text-xs text-slate-500">{formatCurrency(item.price)} each</p>
                      </div>
                      <button
                        onClick={() => cart.removeItem(item.id)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => cart.updateQuantity(item.id, item.quantity - 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold text-slate-900 dark:text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => cart.updateQuantity(item.id, item.quantity + 1)}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg text-white ${
                            isRestaurant ? 'bg-restaurant-600 hover:bg-restaurant-700' : 'bg-brand-600 hover:bg-brand-700'
                          }`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Payment Methods */}
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Payment Method</h4>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.slice(0, 6).map((method) => (
              <button
                key={method.id}
                onClick={() => cart.setPaymentMethod(method.id)}
                className={`rounded-lg border p-2 text-center text-xs font-medium transition-colors ${
                  cart.paymentMethod === method.id
                    ? isRestaurant
                      ? 'border-restaurant-500 bg-restaurant-50 text-restaurant-700 dark:bg-restaurant-950 dark:text-restaurant-400'
                      : 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>
        </div>

        {/* Totals + Checkout */}
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {formatCurrency(cart.getSubtotal())}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Tax (15%)</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {formatCurrency(cart.getTax())}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
              <span className="text-base font-bold text-slate-900 dark:text-white">Total</span>
              <span className={`text-xl font-extrabold ${
                isRestaurant ? 'text-restaurant-600 dark:text-restaurant-400' : 'text-brand-600 dark:text-brand-400'
              }`}>
                {formatCurrency(cart.getGrandTotal())}
              </span>
            </div>
          </div>
          <Button
            variant={isRestaurant ? 'restaurant' : 'primary'}
            size="lg"
            className="mt-4 w-full"
            onClick={handleCheckout}
            disabled={cart.items.length === 0}
          >
            <Receipt className="h-4 w-4" />
            {isRestaurant ? 'Place Order' : 'Complete Sale'}
          </Button>
        </div>
      </div>

      {/* Receipt Modal — ZIMRA Receipt48 format */}
      {showReceipt && receiptData && (
        <ZimraReceipt
          receipt={receiptData}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  )
}

function Package(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" x2="12" y1="22.08" y2="12" />
    </svg>
  )
}
