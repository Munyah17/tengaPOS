import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Search, Plus, Upload, Download, ExternalLink, Edit, Trash2,
  AlertTriangle, Package, BarChart3, RefreshCw, ImageOff, ImagePlus, X,
} from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import ExportMenu from '@/components/common/ExportMenu'
import { formatCurrency } from '@/utils/formatters'
import { generateTemplate, parseCSV } from '@/utils/exportUtils'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import {
  fetchProducts, insertProduct, updateProduct, deleteProduct, uploadProductImage,
  fetchBranches, fetchProductBranches, assignProductBranch, unassignProductBranch,
} from '@/lib/db'
import { getOfflineProducts } from '@/lib/offlineSync'
import toast from 'react-hot-toast'

const BLANK = {
  name: '', brand: '', sku: '', barcode: '', price: '', landingPrice: '',
  stock: '', lowStockThreshold: '10', imageUrl: '', imageUnavailable: false,
  vatTreatment: 'standard', attributePairs: [], branchIds: [],
}

const ATTRIBUTE_PRESETS = ['Weight', 'Volume', 'Color', 'Size']

const VAT_TREATMENTS = [
  { key: 'standard', label: 'Standard-rated', hint: 'VAT charged at the normal rate' },
  { key: 'zero_rated', label: 'Zero-rated', hint: '0% VAT — still a taxable supply (e.g. basic foodstuffs, exports)' },
  { key: 'exempt', label: 'Exempt', hint: 'Outside VAT entirely (e.g. medicines, education)' },
]

export default function Inventory() {
  const { posMode } = useThemeStore()
  const { tenant, branch } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [branches, setBranches] = useState([])
  const [originalBranchIds, setOriginalBranchIds] = useState([])
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!tenant?.id) return
    fetchBranches(tenant.id).then(setBranches).catch(() => {})
  }, [tenant?.id])

  const queryClient = useQueryClient()
  // Same cache key as POS's product query — editing a product here makes
  // POS see the change immediately too, without either page re-fetching
  // from scratch just because the other one changed something.
  const productsQuery = useQuery({
    queryKey: ['products', tenant?.id],
    queryFn: async () => {
      try {
        return await fetchProducts(tenant.id)
      } catch {
        // Same offline-cache fallback POS already uses — AppLayout keeps this
        // cache warm in the background, so it's rarely more than a minute stale.
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
  const products = productsQuery.data || []
  const loading = productsQuery.isLoading

  // Paint instantly from the local cache (already kept warm by AppLayout's
  // background sync) instead of a blank loading state, while the query above
  // fetches a fresh copy in the background and replaces it when it lands.
  useEffect(() => {
    if (!tenant?.id) return
    if (queryClient.getQueryData(['products', tenant.id])) return
    getOfflineProducts(tenant.id).then((cached) => {
      if (cached.length > 0) queryClient.setQueryData(['products', tenant.id], cached)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  useEffect(() => {
    if (productsQuery.isError) toast.error('Failed to load products')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQuery.isError])

  const filtered = useMemo(() => {
    if (!search) return products
    const q = search.toLowerCase()
    return products.filter(
      p => (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q)
    )
  }, [products, search])

  const stats = useMemo(() => ({
    total: products.length,
    lowStock: products.filter(p => p.stock_qty <= (p.low_stock_threshold ?? 10)).length,
    totalValue: products.reduce((s, p) => s + parseFloat(p.price || 0) * (p.stock_qty ?? p.stock ?? 0), 0),
  }), [products])

  const resetImagePicker = () => {
    setImageFile(null)
    setImagePreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const openAdd = () => {
    // Non-vendor staff default to their own branch — matches "1 branch
    // unless manually assigned"; vendors default to unassigned (all branches).
    const defaultBranchIds = branch?.id ? [branch.id] : []
    setForm({ ...BLANK, branchIds: defaultBranchIds })
    setOriginalBranchIds([])
    setEditTarget(null)
    resetImagePicker()
    setShowAdd(true)
  }
  const openEdit = async (p) => {
    let extraBranchIds = []
    try {
      extraBranchIds = await fetchProductBranches(p.id)
    } catch { /* non-fatal — just starts with none pre-selected */ }
    const branchIds = [...new Set([p.branch_id, ...extraBranchIds].filter(Boolean))]
    setForm({
      name: p.name,
      brand: p.brand || '',
      sku: p.sku || '',
      barcode: p.barcode || '',
      price: p.price,
      landingPrice: p.cost_price ?? '',
      stock: p.stock_qty ?? p.stock ?? 0,
      lowStockThreshold: p.low_stock_threshold ?? 10,
      imageUrl: p.image_url || p.image || '',
      imageUnavailable: p.image_unavailable === true,
      vatTreatment: p.vat_treatment || 'standard',
      attributePairs: Object.entries(p.attributes || {}).map(([key, value]) => ({ key, value })),
      branchIds,
    })
    setOriginalBranchIds(branchIds)
    setEditTarget(p)
    resetImagePicker()
    setShowAdd(true)
  }
  const toggleBranch = (branchId) => setForm((f) => ({
    ...f,
    branchIds: f.branchIds.includes(branchId)
      ? f.branchIds.filter((id) => id !== branchId)
      : [...f.branchIds, branchId],
  }))

  const handleImagePick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setForm((f) => ({ ...f, imageUnavailable: false }))
  }

  // Product Image is mandatory unless the "not available" override is ticked
  const hasImage = !!(imagePreview || form.imageUrl)
  const canSave = form.name && form.price && form.stock !== '' && (hasImage || form.imageUnavailable)

  const addAttributePreset = (preset) => {
    setForm((f) => {
      if (f.attributePairs.some((p) => p.key.toLowerCase() === preset.toLowerCase())) return f
      return { ...f, attributePairs: [...f.attributePairs, { key: preset, value: '' }] }
    })
  }
  const addAttributePair = () => setForm((f) => ({ ...f, attributePairs: [...f.attributePairs, { key: '', value: '' }] }))
  const updateAttributePair = (i, field, val) => setForm((f) => ({
    ...f,
    attributePairs: f.attributePairs.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)),
  }))
  const removeAttributePair = (i) => setForm((f) => ({ ...f, attributePairs: f.attributePairs.filter((_, idx) => idx !== i) }))

  const handleSave = async (e) => {
    e.preventDefault()
    if (!hasImage && !form.imageUnavailable) {
      toast.error('Add a product image, or tick "Product Image Not Available"')
      return
    }
    setSaving(true)
    try {
      let imageUrl = form.imageUrl
      if (imageFile) {
        setUploadingImage(true)
        imageUrl = await uploadProductImage(tenant.id, imageFile)
        setUploadingImage(false)
      }
      const attributes = form.attributePairs.reduce((acc, p) => {
        if (p.key.trim()) acc[p.key.trim()] = p.value
        return acc
      }, {})
      // First checked branch becomes the "home" branch_id; any further ones
      // are extra grants recorded in product_branches.
      const [primaryBranchId, ...extraBranchIds] = form.branchIds
      const payload = { ...form, imageUrl: form.imageUnavailable ? '' : imageUrl, attributes, branchId: primaryBranchId || null }

      let productId = editTarget?.id
      if (editTarget) {
        const updated = await updateProduct(editTarget.id, payload)
        queryClient.setQueryData(['products', tenant.id], (old) =>
          (old || []).map(p => p.id === editTarget.id ? { ...updated, stock: updated.stock_qty, category: p.category } : p))
        toast.success('Product updated')
      } else {
        const created = await insertProduct(tenant.id, payload)
        productId = created.id
        queryClient.setQueryData(['products', tenant.id], (old) => [...(old || []), created])
        toast.success('Product added')
      }

      // Reconcile extra branch grants against whatever was there before.
      const previousExtra = originalBranchIds.filter((id) => id !== primaryBranchId)
      const toAdd = extraBranchIds.filter((id) => !previousExtra.includes(id))
      const toRemove = previousExtra.filter((id) => !extraBranchIds.includes(id))
      await Promise.allSettled([
        ...toAdd.map((id) => assignProductBranch(productId, id)),
        ...toRemove.map((id) => unassignProductBranch(productId, id)),
      ])

      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save product')
    } finally {
      setSaving(false)
      setUploadingImage(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteProduct(id)
      queryClient.setQueryData(['products', tenant.id], (old) => (old || []).filter(p => p.id !== id))
      toast.success('Product deleted')
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await parseCSV(file)
      const rows = data.filter((row) => row.name && row.price)
      if (rows.length === 0) {
        toast.error('No valid rows found — check the template format')
        return
      }
      setSaving(true)
      const results = await Promise.allSettled(
        rows.map(row => insertProduct(tenant.id, {
          name: row.name,
          brand: row.brand,
          sku: row.sku,
          barcode: row.barcode,
          price: row.price,
          landingPrice: row.landing_price,
          stock: row.stock,
          lowStockThreshold: row.low_stock_threshold,
          // Bulk-imported rows are assumed to have no photo yet — flagged for follow-up
          imageUnavailable: true,
        }))
      )
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      queryClient.invalidateQueries({ queryKey: ['products', tenant.id] })
      setShowImport(false)
      toast.success(`${succeeded} of ${rows.length} products imported — add photos from the product list when ready`)
    } catch {
      toast.error('Failed to parse file — use the downloaded template format')
    } finally {
      setSaving(false)
    }
  }

  const exportColumns = [
    { header: 'Name', key: 'name' },
    { header: 'SKU', key: 'sku' },
    { header: 'Barcode', key: 'barcode' },
    { header: 'Category', key: 'category' },
    { header: 'Price', key: 'price' },
    { header: 'Stock', key: 'stock_qty' },
  ]

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Inventory</h1>
          <p className="text-sm text-slate-500">Manage your products and stock levels</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="http://scancode.co.zw" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Get Barcodes <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button onClick={() => productsQuery.refetch()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" /> Mass Import
          </Button>
          <ExportMenu data={products} columns={exportColumns} title="Inventory" filename="tengapos_inventory" />
          <Button variant={isRestaurant ? 'restaurant' : 'primary'} onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Total Products', value: stats.total, icon: Package, color: 'brand' },
          { label: 'Low Stock Items', value: stats.lowStock, icon: AlertTriangle, color: 'amber' },
          { label: 'Total Inventory Value', value: formatCurrency(stats.totalValue), icon: BarChart3, color: 'green' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2 ${stat.color === 'brand' ? 'bg-brand-100 text-brand-600 dark:bg-brand-900 dark:text-brand-400' : stat.color === 'amber' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400' : 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'}`}>
                <stat.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-slate-500">{stat.label}</div>
                <div className="text-xl font-extrabold text-slate-900 dark:text-white">{stat.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products by name, SKU, or barcode..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading products…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Product', 'SKU', 'Barcode', 'Price', 'Stock', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    {products.length === 0 ? 'No products yet — add your first product to get started.' : 'No products match your search.'}
                  </td></tr>
                ) : filtered.map(product => {
                  const stockQty = product.stock_qty ?? product.stock ?? 0
                  const threshold = product.low_stock_threshold ?? 10
                  const img = product.image_url || product.image
                  return (
                    <motion.tr
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                            {img
                              ? <img src={img} alt="" className="h-full w-full object-cover" />
                              : <ImageOff className="h-4 w-4 text-slate-400" />}
                          </div>
                          <div className="min-w-0">
                            <span className="truncate text-sm font-medium text-slate-900 dark:text-white">{product.name}</span>
                            {product.brand && <p className="truncate text-xs text-slate-400">{product.brand}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{product.sku || '—'}</td>
                      <td className="px-4 py-3 font-mono text-sm text-slate-600 dark:text-slate-400">{product.barcode || '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(product.price)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${stockQty <= 0 ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : stockQty <= threshold ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}`}>
                          {stockQty}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(product)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(product.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title={editTarget ? 'Edit Product' : 'Add Product'}>
        <form onSubmit={handleSave} className="space-y-4">
          {/* Product image — mandatory unless overridden */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Product Image {!form.imageUnavailable && <span className="text-red-500">*</span>}
            </label>
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                {imagePreview || form.imageUrl ? (
                  <img src={imagePreview || form.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" id="product-image-input" />
                <label htmlFor="product-image-input" className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Upload className="h-3.5 w-3.5" /> Upload Photo
                </label>
                {(imagePreview || form.imageUrl) && (
                  <button
                    type="button"
                    onClick={() => { resetImagePicker(); setForm((f) => ({ ...f, imageUrl: '' })) }}
                    className="ml-2 inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
                  >
                    <X className="h-3 w-3" /> Remove
                  </button>
                )}
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={form.imageUnavailable}
                    onChange={(e) => setForm((f) => ({ ...f, imageUnavailable: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  Product Image Not Available
                </label>
              </div>
            </div>
          </div>

          {[
            { label: 'Product Name *', field: 'name', type: 'text', required: true },
            { label: 'Brand', field: 'brand', type: 'text', required: false },
            { label: 'SKU', field: 'sku', type: 'text', required: false },
            { label: 'Barcode', field: 'barcode', type: 'text', required: false },
            { label: 'Selling Price (VAT-inclusive) *', field: 'price', type: 'number', required: true },
            { label: 'Landing Price (what it cost you)', field: 'landingPrice', type: 'number', required: false },
            { label: 'Stock Quantity *', field: 'stock', type: 'number', required: true },
            { label: 'Low Stock Alert At', field: 'lowStockThreshold', type: 'number', required: false },
          ].map(f => (
            <div key={f.field}>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{f.label}</label>
              <input
                type={f.type}
                value={form[f.field]}
                onChange={e => setForm({ ...form, [f.field]: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required={f.required}
                step={f.type === 'number' ? '0.01' : undefined}
                min={f.type === 'number' ? '0' : undefined}
              />
            </div>
          ))}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">VAT Treatment</label>
            <select
              value={form.vatTreatment}
              onChange={e => setForm({ ...form, vatTreatment: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {VAT_TREATMENTS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {VAT_TREATMENTS.find(t => t.key === form.vatTreatment)?.hint}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Attributes</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {ATTRIBUTE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => addAttributePreset(preset)}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  + {preset}
                </button>
              ))}
              <button
                type="button"
                onClick={addAttributePair}
                className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                + Custom
              </button>
            </div>
            {form.attributePairs.length > 0 && (
              <div className="space-y-2">
                {form.attributePairs.map((pair, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={pair.key}
                      onChange={(e) => updateAttributePair(i, 'key', e.target.value)}
                      placeholder="Attribute (e.g. Weight)"
                      className="w-1/3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <input
                      type="text"
                      value={pair.value}
                      onChange={(e) => updateAttributePair(i, 'value', e.target.value)}
                      placeholder="Value (e.g. 500g)"
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => removeAttributePair(i)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {branches.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Branches</label>
              <p className="mb-1.5 text-xs text-slate-500">
                {form.branchIds.length === 0
                  ? 'Not attached to a branch — visible at every branch.'
                  : 'Only visible/sellable at the branches checked below.'}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {branches.map((b) => (
                  <label key={b.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.branchIds.includes(b.id)}
                      onChange={() => toggleBranch(b.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    {b.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <ExternalLink className="h-3.5 w-3.5" />
            <a href="http://scancode.co.zw" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">Need barcodes? Visit scancode.co.zw</a>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !canSave}>
              {uploadingImage ? 'Uploading image…' : saving ? 'Saving…' : (editTarget ? 'Save Changes' : 'Add Product')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Mass Import Modal */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Mass Import Inventory">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Add your whole inventory in one upload. Download the CSV template, fill it in, then upload it back.
            Prices are VAT-inclusive — enter the shelf price customers actually pay.
          </p>
          <Button variant="secondary" onClick={generateTemplate}><Download className="h-4 w-4" /> Download CSV Template</Button>
          <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <Upload className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-600 dark:text-slate-400">Drop your CSV file here or click to browse</p>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} className="mt-3 text-sm" />
          </div>
          <p className="text-xs text-slate-500">
            Imported products are flagged "Image Not Available" — add photos individually afterwards from the product list.
          </p>
        </div>
      </Modal>
    </div>
  )
}
