import { useState, useMemo, useEffect, useRef } from 'react'
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
import { fetchProducts, insertProduct, updateProduct, deleteProduct, uploadProductImage } from '@/lib/db'
import toast from 'react-hot-toast'

const BLANK = {
  name: '', brand: '', sku: '', barcode: '', price: '', landingPrice: '',
  stock: '', lowStockThreshold: '10', imageUrl: '', imageUnavailable: false,
}

export default function Inventory() {
  const { posMode } = useThemeStore()
  const { tenant } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef(null)

  const loadProducts = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchProducts(tenant.id)
      .then(setProducts)
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadProducts() }, [tenant?.id])

  const filtered = useMemo(() => {
    if (!search) return products
    const q = search.toLowerCase()
    return products.filter(
      p => p.name.toLowerCase().includes(q) ||
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

  const openAdd = () => { setForm(BLANK); setEditTarget(null); resetImagePicker(); setShowAdd(true) }
  const openEdit = (p) => {
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
    })
    setEditTarget(p)
    resetImagePicker()
    setShowAdd(true)
  }

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
      const payload = { ...form, imageUrl: form.imageUnavailable ? '' : imageUrl }

      if (editTarget) {
        const updated = await updateProduct(editTarget.id, payload)
        setProducts(prev => prev.map(p => p.id === editTarget.id ? { ...updated, stock: updated.stock_qty, category: p.category } : p))
        toast.success('Product updated')
      } else {
        const created = await insertProduct(tenant.id, payload)
        setProducts(prev => [...prev, created])
        toast.success('Product added')
      }
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
      setProducts(prev => prev.filter(p => p.id !== id))
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
      loadProducts()
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
          <button onClick={loadProducts} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" title="Refresh">
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
