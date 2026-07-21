import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Barcode, Plus, Minus, Trash2, ShoppingCart,
  CreditCard, Banknote, Smartphone, Receipt, X, Car, Store, Package as PackageIcon,
  RefreshCw, ExternalLink, Camera, Percent,
} from 'lucide-react'
import Button from '@/components/common/Button'
import ZimraReceipt from '@/components/common/ZimraReceipt'
import { useCartStore } from '@/stores/cartStore'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { PAYMENT_METHODS } from '@/utils/constants'
import { formatCurrency, generateReceiptNumber } from '@/utils/formatters'
import { initiatePaynowCheckout } from '@/lib/paynow'
import { fetchProducts, saveCheckout, fetchStaff } from '@/lib/db'
import { getOfflineProducts, queueOfflineSale } from '@/lib/offlineSync'
import { supabase } from '@/lib/supabase'
import { useFiscalStore } from '@/stores/fiscalStore'
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
  const { tenant, user, branch } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const cart = useCartStore()
  const fiscal = useFiscalStore()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [showReceipt, setShowReceipt] = useState(false)
  const [receiptData, setReceiptData] = useState(null)
  const [paynowLoading, setPaynowLoading] = useState(false)
  const [showMobileCart, setShowMobileCart] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const [amountTendered, setAmountTendered] = useState('')
  const [staffList, setStaffList] = useState([])
  const [showSalesperson, setShowSalesperson] = useState(false)
  const [salespersonMode, setSalespersonMode] = useState('staff') // 'staff' | 'manual'
  const [salespersonStaffId, setSalespersonStaffId] = useState('')
  const [salespersonManualName, setSalespersonManualName] = useState('')
  const [salespersonManualEmpNo, setSalespersonManualEmpNo] = useState('')
  const videoRef = useRef(null)
  const scanStreamRef = useRef(null)
  const fmt = (n) => formatCurrency(n, tenant?.currency)

  const queryClient = useQueryClient()
  // Cached (staleTime) instead of a hard fetch-on-every-mount — a cashier
  // bouncing between POS and another tab isn't re-downloading the whole
  // catalogue every time on a slow connection.
  const productsQuery = useQuery({
    queryKey: ['products', tenant?.id],
    queryFn: async () => {
      try {
        return await fetchProducts(tenant.id)
      } catch {
        const cached = await getOfflineProducts(tenant.id)
        if (cached.length > 0) {
          toast('Offline — showing cached inventory', { icon: '📴' })
          return cached
        }
        throw new Error('Failed to load products')
      }
    },
    enabled: !!tenant?.id,
    staleTime: 30000,
  })
  const liveProducts = productsQuery.data || []
  const productsLoading = productsQuery.isLoading

  useEffect(() => {
    if (productsQuery.isError) toast.error('Failed to load products')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQuery.isError])

  // VAT config comes from the tenant's own settings (inclusive pricing)
  useEffect(() => {
    if (tenant) cart.setVatConfig(tenant.vat_enabled, tenant.vat_rate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.vat_enabled, tenant?.vat_rate])

  // Staff available to pick as Salesperson — scoped to this branch when one
  // is set, otherwise every staff member on the tenant.
  useEffect(() => {
    if (!tenant?.id) return
    fetchStaff(tenant.id)
      .then((rows) => setStaffList(branch?.id ? rows.filter((r) => r.branch_id === branch.id) : rows))
      .catch(() => {})
  }, [tenant?.id, branch?.id])

  // ─── Camera barcode scanning (phone/tablet camera via BarcodeDetector) ───
  const stopScanner = () => {
    scanStreamRef.current?.getTracks().forEach((t) => t.stop())
    scanStreamRef.current = null
    setShowScanner(false)
  }

  const handleBarcodeFound = (code) => {
    const product = products.find((p) => p.barcode && p.barcode === code)
    if (product) {
      cart.addItem(product)
      toast.success(`${product.name} added`)
      stopScanner()
    } else {
      setSearch(code)
      toast(`No product with barcode ${code}`, { icon: '🔍' })
      stopScanner()
    }
  }

  const startScanner = async () => {
    if (!('BarcodeDetector' in window)) {
      toast.error('Camera scanning needs Chrome/Edge on Android or desktop. USB/Bluetooth scanners work in the search box.')
      return
    }
    setShowScanner(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      scanStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      const detector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
      })
      const tick = async () => {
        if (!scanStreamRef.current || !videoRef.current) return
        try {
          const codes = await detector.detect(videoRef.current)
          if (codes.length > 0) {
            handleBarcodeFound(codes[0].rawValue)
            return
          }
        } catch { /* frame not ready */ }
        if (scanStreamRef.current) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    } catch (err) {
      stopScanner()
      toast.error(err.name === 'NotAllowedError'
        ? 'Camera permission denied — allow camera access to scan'
        : 'Could not open the camera')
    }
  }

  // Hardware scanners type the barcode + Enter into the search box
  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && search.trim()) {
      const product = products.find((p) => p.barcode && p.barcode === search.trim())
      if (product) {
        cart.addItem(product)
        setSearch('')
        toast.success(`${product.name} added`)
      }
    }
  }

  const products = liveProducts
  const categories = isRestaurant ? restaurantCategories : [{ id: 'all', name: 'All' }]

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode || '').includes(search)
      const matchCategory = category === 'all' || p.category === category
      return matchSearch && matchCategory
    })
  }, [products, search, category])

  // Mobile-money methods run through Paynow's hosted checkout, never manually
  const PAYNOW_METHODS = ['ecocash', 'innbucks', 'omari', 'onemoney', 'zipit']
  const tenderedAmount = parseFloat(amountTendered) || 0
  const changeDue = Math.max(0, tenderedAmount - cart.getGrandTotal())
  const cashShortfall = cart.paymentMethod === 'cash' && amountTendered !== '' && tenderedAmount < cart.getGrandTotal()

  // Resolved only if the cashier actually opened the Salesperson section and
  // it has a name either way (picked from staff, or typed in). Left blank
  // otherwise so the receipt stays silent about it — no "Salesperson: —" line.
  const selectedSalesperson = staffList.find((s) => s.id === salespersonStaffId)
  const salespersonName = !showSalesperson ? ''
    : salespersonMode === 'staff' ? (selectedSalesperson?.name || '')
    : salespersonManualName.trim()
  const salespersonEmployeeNo = !showSalesperson ? ''
    : salespersonMode === 'staff' ? (selectedSalesperson?.employee_no || '')
    : salespersonManualEmpNo.trim()

  const resetSalesperson = () => {
    setShowSalesperson(false)
    setSalespersonMode('staff')
    setSalespersonStaffId('')
    setSalespersonManualName('')
    setSalespersonManualEmpNo('')
  }

  const handleCheckout = async () => {
    if (cart.items.length === 0) {
      toast.error('Cart is empty')
      return
    }
    if (PAYNOW_METHODS.includes(cart.paymentMethod)) {
      // Redirect to Paynow — it completes the payment, our return page polls for 30s
      return handlePaynowCheckout()
    }
    // Give the button a paint frame before the network work (INP fix)
    setCheckingOut(true)
    await new Promise((r) => setTimeout(r, 30))
    const subtotal = cart.getSubtotal()
    const tax = cart.getTax()
    const total = cart.getGrandTotal()

    let receiptNumber = generateReceiptNumber()

    let fdmsQrUrl = null

    if (tenant?.id) {
      const checkoutPayload = {
        tenantId: tenant.id,
        branchId: branch?.id || null,
        userId: user?.id || null,
        cartItems: cart.items,
        paymentMethod: cart.paymentMethod,
        subtotal,
        tax,
        total,
        posMode,
        orderType: isRestaurant ? (cart.orderType || 'counter') : 'sale',
        // Generated once, up front, and reused on every retry (live retry
        // via the offline queue, or a background sync replay) so a retried
        // sale is recognized as the same sale server-side instead of being
        // processed — and stock-decremented — a second time.
        receiptNo: receiptNumber,
        salespersonName: salespersonName || null,
        salespersonEmployeeNo: salespersonEmployeeNo || null,
      }

      if (!navigator.onLine) {
        // Offline: queue the sale for background sync, don't block the cashier.
        // Stock isn't decremented until the sale syncs — acceptable trade-off
        // for offline-first operation.
        await queueOfflineSale(checkoutPayload)
        toast('Offline — sale saved, will sync automatically', { icon: '📴' })
      } else {
        try {
          const result = await saveCheckout(checkoutPayload)
          receiptNumber = result.receiptNo
          // We already know exactly what was decremented — patch the cache
          // locally instead of firing a whole new products query for data
          // we can compute ourselves.
          queryClient.setQueryData(['products', tenant.id], (old) =>
            (old || []).map((p) => {
              const line = cart.items.find((i) => i.id === p.id)
              return line ? { ...p, stock: Math.max(0, (p.stock ?? 0) - line.quantity) } : p
            })
          )
        } catch (err) {
          const msg = err.message || 'unknown'
          if (msg.includes('Insufficient stock') || msg.includes('Stock check failed')) {
            // Hard stop — never sell what isn't in stock
            toast.error(msg)
            setCheckingOut(false)
            // Stock actually IS stale here (that's why the sale failed) —
            // this one genuinely needs a fresh read, not an optimistic patch.
            queryClient.invalidateQueries({ queryKey: ['products', tenant.id] })
            return
          }
          // Network/server error mid-sale — queue it rather than lose the sale
          await queueOfflineSale(checkoutPayload)
          toast('Connection issue — sale saved, will sync automatically', { icon: '📴' })
        }
      }

      // Submit to ZIMRA FDMS if fiscal day is open
      if (fiscal.isEnabled && fiscal.isRegistered && fiscal.fiscalDayStatus === 'open') {
        try {
          const { data: fdmsData, error: fdmsErr } = await supabase.functions.invoke(
            'zimra-submit-receipt',
            {
              body: {
                tenant_id: tenant.id,
                receipt: {
                  receiptNumber,
                  items: cart.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
                  subtotal,
                  tax,
                  total,
                  paymentMethod: cart.paymentMethod,
                  date: new Date().toISOString(),
                  vatRate: cart.vatEnabled ? cart.vatRate : 0,
                  currency: tenant?.currency || 'USD',
                },
              },
            },
          )
          if (!fdmsErr && fdmsData && !fdmsData.error) {
            fiscal.incrementReceiptNo()
            if (fdmsData.fdmsHash) fiscal.setLastReceiptHash(fdmsData.fdmsHash)
            fdmsQrUrl = fdmsData.receiptQrUrl || null
            if (fdmsData.warning) {
              toast(`Fiscalised locally — ZIMRA unreachable: ${fdmsData.warning}`, { duration: 5000 })
            }
          }
        } catch {
          // Non-blocking — the sale is already saved; fiscal failure is not fatal
        }
      }
    }

    const grossTotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0)
    const receipt = {
      receiptNumber,
      items: cart.items,
      subtotal,
      tax,
      total,
      discountAmount: Math.max(0, grossTotal - total),
      paymentMethod: cart.paymentMethod,
      date: new Date().toISOString(),
      cashier: useAuthStore.getState().profile?.name || 'Cashier',
      fdmsQrUrl,
      vatEnabled: cart.vatEnabled,
      vatRate: cart.vatRate,
      currency: tenant?.currency,
      amountTendered: cart.paymentMethod === 'cash' && tenderedAmount > 0 ? tenderedAmount : null,
      changeDue: cart.paymentMethod === 'cash' && tenderedAmount > 0 ? changeDue : null,
      salespersonName: salespersonName || null,
      salespersonEmployeeNo: salespersonEmployeeNo || null,
    }
    setReceiptData(receipt)
    setShowReceipt(true)
    setShowMobileCart(false)
    cart.clearCart()
    setAmountTendered('')
    resetSalesperson()
    setCheckingOut(false)
    toast.success(isRestaurant ? 'Order sent to kitchen!' : 'Transaction completed!')
  }

  const handlePaynowCheckout = async () => {
    if (cart.items.length === 0) { toast.error('Cart is empty'); return }
    if (!tenant?.id) { toast.error('Not authenticated'); return }

    setPaynowLoading(true)
    try {
      const { browserUrl } = await initiatePaynowCheckout({
        tenantId: tenant.id,
        amount:   cart.getGrandTotal(),
        items:    cart.items,
      })
      // Clear cart before leaving the POS — the return page handles success/failure
      cart.clearCart()
      window.location.href = browserUrl
    } catch (err) {
      toast.error(err.message || 'Failed to initiate Paynow checkout')
      setPaynowLoading(false)
    }
  }

  const accent = isRestaurant ? 'restaurant' : 'brand'

  return (
    <div className="relative flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      {/* Product Area — full screen on mobile, flex-1 on desktop */}
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
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search by name, SKU, or barcode..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              {/* Suggestive search — matching products drop down as you type */}
              {searchFocused && search.trim().length > 0 && filtered.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                  {filtered.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { cart.addItem(p); setSearch(''); toast.success(`${p.name} added`) }}
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                        {p.image
                          ? <img src={p.image} alt="" className="h-full w-full object-cover" />
                          : <PackageIcon className="h-4 w-4 text-slate-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{p.name}</p>
                        <p className="text-xs text-slate-500">{p.sku} · {p.stock} in stock</p>
                      </div>
                      <span className="flex-shrink-0 text-sm font-bold text-slate-900 dark:text-white">{fmt(p.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={startScanner}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <Camera className="h-4 w-4" />
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
          {products.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <PackageIcon className="mb-3 h-14 w-14 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">No products yet</p>
              <p className="mt-1 text-xs text-slate-400">Go to Inventory to add your products, then they'll appear here</p>
            </div>
          )}
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
                    {fmt(product.price)}
                  </span>
                  <span className="text-xs text-slate-500">{product.stock} in stock</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">SKU: {product.sku}</div>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile floating cart button — hidden on desktop */}
      <button
        onClick={() => setShowMobileCart(true)}
        className={`fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full px-5 py-3.5 text-sm font-bold text-white shadow-2xl transition-transform active:scale-95 md:hidden ${
          isRestaurant ? 'bg-restaurant-600' : 'bg-brand-600'
        }`}
      >
        <ShoppingCart className="h-5 w-5" />
        {cart.items.length > 0
          ? <span>{cart.items.length} item{cart.items.length !== 1 ? 's' : ''} · {fmt(cart.getGrandTotal())}</span>
          : <span>{isRestaurant ? 'Order' : 'Cart'}</span>}
        {cart.items.length > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-xs font-extrabold">
            {cart.items.length}
          </span>
        )}
      </button>

      {/* Cart Panel — full-screen overlay on mobile, fixed sidebar on desktop.
          Width is a clamp (proportional, not a rigid px value) so it doesn't
          eat a disproportionate share of the screen on POS terminals whose
          viewport sits right at the mobile/desktop breakpoint boundary, or
          when zoomed — it scales with the available width instead of
          staying fixed while the product grid squeezes down around it. */}
      <div className={`
        flex flex-col bg-white dark:bg-slate-950
        border-slate-200 dark:border-slate-800
        md:w-[clamp(280px,28vw,384px)] md:flex-shrink-0 md:border-l
        ${showMobileCart
          ? 'fixed inset-0 z-50 md:relative md:inset-auto md:z-auto'
          : 'hidden md:flex'}
      `}>
        {/* Cart Header */}
        <div className="flex flex-col gap-0 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 p-4 pb-2">
            <ShoppingCart className={`h-5 w-5 ${isRestaurant ? 'text-restaurant-600' : 'text-brand-600'}`} />
            <h2 className="font-bold text-slate-900 dark:text-white">
              {isRestaurant ? 'Order' : 'Cart'}
            </h2>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {cart.items.length} items
            </span>
            {/* Close button — mobile only */}
            <button
              onClick={() => setShowMobileCart(false)}
              className="ml-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Drive-through / Counter toggle — restaurant only */}
          {isRestaurant && (
            <div className="flex gap-0 overflow-hidden rounded-xl mx-4 mb-3 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => cart.setOrderType('counter')}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-bold transition-colors ${
                  cart.orderType !== 'drive_through'
                    ? 'bg-restaurant-600 text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Store className="h-3.5 w-3.5" />
                Counter
              </button>
              <button
                onClick={() => cart.setOrderType('drive_through')}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-bold transition-colors ${
                  cart.orderType === 'drive_through'
                    ? 'bg-yellow-500 text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Car className="h-3.5 w-3.5" />
                Drive-Through
              </button>
            </div>
          )}
        </div>

        {/* Cart Items — min-h keeps at least a product or two visible even
            when the footer below (payment methods, totals, buttons) is at
            its tallest; overflow-auto scrolls the rest. */}
        <div className="min-h-[120px] flex-1 overflow-auto p-4">
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
                        <p className="text-xs text-slate-500">{fmt(item.price)} each</p>
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
                        {fmt(item.price * item.quantity)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Payment Method + Totals + Checkout — one compact block (was two
            separately-padded sections) so the cart items area above keeps
            as much of the sidebar's height as possible. */}
        <div className="max-h-[52%] flex-shrink-0 overflow-y-auto border-t border-slate-200 p-3 dark:border-slate-800">
          <h4 className="mb-1.5 text-xs font-semibold uppercase text-slate-500">Payment Method</h4>
          <div className="grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.slice(0, 6).map((method) => (
              <button
                key={method.id}
                onClick={() => cart.setPaymentMethod(method.id)}
                className={`rounded-lg border py-1.5 text-center text-xs font-medium transition-colors ${
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

          {/* Cash tendered / change — optional; only relevant for cash sales */}
          {cart.paymentMethod === 'cash' && (
            <div className="mt-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase text-slate-500">Amount Tendered</label>
                {amountTendered !== '' && (
                  <button
                    onClick={() => setAmountTendered('')}
                    className="text-xs font-semibold text-red-500 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountTendered}
                onChange={(e) => setAmountTendered(e.target.value)}
                placeholder={fmt(cart.getGrandTotal())}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {amountTendered !== '' && (
                <div className="mt-1.5 flex justify-between text-sm">
                  <span className="text-slate-500">{cashShortfall ? 'Short by' : 'Change'}</span>
                  <span className={`font-bold ${cashShortfall ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                    {cashShortfall ? fmt(cart.getGrandTotal() - tenderedAmount) : fmt(changeDue)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="mb-1.5 mt-3 flex items-center gap-2">
            <Percent className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <span className="text-sm text-slate-500">Discount</span>
            <select
              value={cart.discountType}
              onChange={(e) => cart.setDiscountType(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="percent">%</option>
              <option value="fixed">{tenant?.currency || '$'}</option>
            </select>
            <input
              type="number"
              min="0"
              max={cart.discountType === 'percent' ? 100 : undefined}
              value={cart.discount || ''}
              onChange={(e) => {
                const raw = Math.max(0, Number(e.target.value) || 0)
                cart.setDiscount(cart.discountType === 'percent' ? Math.min(100, raw) : raw)
              }}
              placeholder="0"
              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {cart.discount > 0 && (
              <button
                onClick={() => cart.setDiscount(0)}
                className="ml-auto text-xs font-semibold text-red-500 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Salesperson — optional, distinct from the cashier. Silent on
              the receipt entirely unless one is actually picked/typed. */}
          {!showSalesperson ? (
            <button
              onClick={() => setShowSalesperson(true)}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
            >
              + Add Salesperson
            </button>
          ) : (
            <div className="mt-2 rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase text-slate-500">Salesperson</span>
                <button onClick={resetSalesperson} className="text-xs font-semibold text-red-500 hover:underline">
                  Remove
                </button>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() => setSalespersonMode('staff')}
                  className={`flex-1 rounded-lg border py-1 text-xs font-medium ${salespersonMode === 'staff' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400'}`}
                >
                  Select Staff
                </button>
                <button
                  onClick={() => setSalespersonMode('manual')}
                  className={`flex-1 rounded-lg border py-1 text-xs font-medium ${salespersonMode === 'manual' ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400'}`}
                >
                  Type Manually
                </button>
              </div>
              {salespersonMode === 'staff' ? (
                <select
                  value={salespersonStaffId}
                  onChange={(e) => setSalespersonStaffId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Select staff…</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.employee_no ? ` (${s.employee_no})` : ''}</option>
                  ))}
                </select>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  <input
                    type="text"
                    value={salespersonManualName}
                    onChange={(e) => setSalespersonManualName(e.target.value)}
                    placeholder="Salesperson name"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <input
                    type="text"
                    value={salespersonManualEmpNo}
                    onChange={(e) => setSalespersonManualEmpNo(e.target.value)}
                    placeholder="Employee number (optional)"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              )}
            </div>
          )}

          <div className="mt-3 space-y-1">
            {cart.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">
                  Discount ({cart.discountType === 'percent' ? `${cart.discount}%` : fmt(cart.discount)})
                </span>
                <span className="font-medium text-red-500">
                  -{fmt(cart.items.reduce((s, i) => s + i.price * i.quantity * (1 - (i.itemDiscount || 0) / 100), 0) - cart.getTotal())}
                </span>
              </div>
            )}
            {cart.vatEnabled ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Net (ex VAT)</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {fmt(cart.getSubtotal())}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">VAT {cart.vatRate}% (included)</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {fmt(cart.getTax())}
                  </span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 dark:border-slate-700">
              <span className="text-base font-bold text-slate-900 dark:text-white">Total</span>
              <span className={`text-xl font-extrabold ${
                isRestaurant ? 'text-restaurant-600 dark:text-restaurant-400' : 'text-brand-600 dark:text-brand-400'
              }`}>
                {fmt(cart.getGrandTotal())}
              </span>
            </div>
          </div>
          <Button
            variant={isRestaurant ? 'restaurant' : 'primary'}
            size="lg"
            className="mt-3 w-full"
            onClick={handleCheckout}
            disabled={cart.items.length === 0 || checkingOut || cashShortfall}
          >
            {checkingOut ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            {checkingOut
              ? 'Processing…'
              : PAYNOW_METHODS.includes(cart.paymentMethod)
                ? 'Continue to Paynow'
                : isRestaurant ? 'Place Order' : 'Complete Sale'}
          </Button>

          {/* Paynow hosted checkout — redirects to Paynow, returns to /payment/return */}
          <button
            onClick={handlePaynowCheckout}
            disabled={cart.items.length === 0 || paynowLoading}
            className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#f7941d] bg-white py-2.5 text-sm font-bold text-[#f7941d] transition-colors hover:bg-[#f7941d] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-900 dark:hover:bg-[#f7941d] dark:hover:text-white"
          >
            {paynowLoading
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <ExternalLink className="h-4 w-4" />}
            {paynowLoading ? 'Opening Paynow…' : 'Pay with Paynow'}
          </button>
          <p className="mt-1 text-center text-[10px] text-slate-400">
            EcoCash · OneMoney · InnBucks · Omari and more
          </p>
        </div>
      </div>

      {/* Receipt Modal — ZIMRA Receipt48 format */}
      {showReceipt && receiptData && (
        <ZimraReceipt
          receipt={receiptData}
          onClose={() => setShowReceipt(false)}
        />
      )}

      {/* Camera barcode scanner */}
      {showScanner && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-md">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold text-white">
                <Barcode className="h-4 w-4" /> Point the camera at a barcode or QR code
              </p>
              <button onClick={stopScanner} className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20">
                <X className="h-5 w-5" />
              </button>
            </div>
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-[4/3] w-full rounded-2xl border-2 border-white/30 object-cover"
            />
            <p className="mt-3 text-center text-xs text-slate-400">
              Works with phone and tablet cameras. USB/Bluetooth scanners can type straight into the search box.
            </p>
          </div>
        </div>
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
