import { useState, useMemo, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Plus, Upload, Download, ExternalLink, Edit, Trash2,
  AlertTriangle, Package, BarChart3, RefreshCw,
} from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import ExportMenu from '@/components/common/ExportMenu'
import { DEMO_PRODUCTS } from '@/utils/constants'
import { formatCurrency } from '@/utils/formatters'
import { generateTemplate, parseCSV } from '@/utils/exportUtils'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchProducts, insertProduct, updateProduct, deleteProduct } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

const BLANK = { name: '', sku: '', barcode: '', price: '', stock: '', lowStockThreshold: '10' }

export default function Inventory() {
  const { posMode } = useThemeStore()
  const { isDemo, tenant } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [products, setProducts] = useState(isDemo ? DEMO_PRODUCTS : [])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(BLANK)

  const loadProducts = () => {
    if (isDemo || !tenant?.id) return
    setLoading(true)
    fetchProducts(tenant.id)
      .then(setProducts)
      .catch(() => toast.error('Failed to load products'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadProducts() }, [isDemo, tenant?.id])

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

  const openAdd = () => { setForm(BLANK); setEditTarget(null); setShowAdd(true) }
  const openEdit = (p) => {
    setForm({ name: p.name, sku: p.sku || '', barcode: p.barcode || '', price: p.price, stock: p.stock_qty ?? p.stock ?? 0, lowStockThreshold: p.low_stock_threshold ?? 10 })
    setEditTarget(p)
    setShowAdd(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (isDemo) {
      if (editTarget) {
        setProducts(prev => prev.map(p => p.id === editTarget.id ? { ...p, ...form, price: parseFloat(form.price), stock: parseInt(form.stock) } : p))
      } else {
        setProducts(prev => [...prev, { ...form, id: Date.now(), price: parseFloat(form.price), stock: parseInt(form.stock) }])
      }
      setShowAdd(false)
      toast.success(editTarget ? 'Product updated' : 'Product added')
      return
    }
    setSaving(true)
    try {
      if (editTarget) {
        const updated = await updateProduct(editTarget.id, form)
        setProducts(prev => prev.map(p => p.id === editTarget.id ? { ...updated, stock: updated.stock_qty, category: p.category } : p))
        toast.success('Product updated')
      } else {
        const created = await insertProduct(tenant.id, form)
        setProducts(prev => [...prev, created])
        toast.success('Product added')
      }
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (isDemo) { setProducts(prev => prev.filter(p => p.id !== id)); toast.success('Product deleted'); return }
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
      if (isDemo) {
        const imported = data.map((row, i) => ({ id: Date.now() + i, name: row.name || '', sku: row.sku || '', barcode: row.barcode || '', category: row.category || '', price: parseFloat(row.price) || 0, stock: parseInt(row.stock) || 0 }))
        setProducts(prev => [...prev, ...imported])
        setShowImport(false)
        toast.success(`${imported.length} products imported`)
        return
      }
      setSaving(true)
      const results = await Promise.allSettled(
        data.map(row => insertProduct(tenant.id, { name: row.name, sku: row.sku, barcode: row.barcode, price: row.price, stock: row.stock }))
      )
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      loadProducts()
      setShowImport(false)
      toast.success(`${succeeded} of ${data.length} products imported`)
    } catch {
      toast.error('Failed to parse file')
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
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Inventory</h1>
          <p className="text-sm text-slate-500">Manage your products and stock levels</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="http://scancode.co.zw" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Get Barcodes <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {!isDemo && (
            <button onClick={loadProducts} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" /> Import
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
                  return (
                    <motion.tr
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{product.name}</span>
                        {product.brand && <p className="text-xs text-slate-400">{product.brand}</p>}
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
          {[
            { label: 'Product Name *', field: 'name', type: 'text', required: true },
            { label: 'SKU', field: 'sku', type: 'text', required: false },
            { label: 'Barcode', field: 'barcode', type: 'text', required: false },
            { label: 'Price (USD) *', field: 'price', type: 'number', required: true },
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
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : (editTarget ? 'Save Changes' : 'Add Product')}</Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Import Inventory">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">Upload a CSV file. Download the template to see the required format.</p>
          <Button variant="secondary" onClick={generateTemplate}><Download className="h-4 w-4" /> Download Template</Button>
          <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <Upload className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-600 dark:text-slate-400">Drop your file here or click to browse</p>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} className="mt-3 text-sm" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
