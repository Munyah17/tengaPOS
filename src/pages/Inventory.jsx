import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Plus, Upload, Download, ExternalLink, Filter,
  Edit, Trash2, AlertTriangle, Package, BarChart3,
} from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import ExportMenu from '@/components/common/ExportMenu'
import { DEMO_PRODUCTS } from '@/utils/constants'
import { formatCurrency } from '@/utils/formatters'
import { generateTemplate, parseCSV } from '@/utils/exportUtils'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

export default function Inventory() {
  const { posMode } = useThemeStore()
  const { isDemo } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [products, setProducts] = useState(isDemo ? DEMO_PRODUCTS : [])
  const [newProduct, setNewProduct] = useState({
    name: '', sku: '', barcode: '', category: '', price: '', stock: '',
  })

  const filtered = useMemo(() => {
    if (!search) return products
    const q = search.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q)
    )
  }, [products, search])

  const stats = useMemo(() => ({
    total: products.length,
    lowStock: products.filter((p) => p.stock < 30).length,
    totalValue: products.reduce((sum, p) => sum + p.price * p.stock, 0),
  }), [products])

  const handleAddProduct = (e) => {
    e.preventDefault()
    const product = {
      ...newProduct,
      id: Date.now(),
      price: parseFloat(newProduct.price),
      stock: parseInt(newProduct.stock),
    }
    setProducts([...products, product])
    setShowAdd(false)
    setNewProduct({ name: '', sku: '', barcode: '', category: '', price: '', stock: '' })
    toast.success('Product added')
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await parseCSV(file)
      const imported = data.map((row, i) => ({
        id: Date.now() + i,
        name: row.name || '',
        sku: row.sku || '',
        barcode: row.barcode || '',
        category: row.category || '',
        price: parseFloat(row.price) || 0,
        stock: parseInt(row.stock) || 0,
      }))
      setProducts([...products, ...imported])
      setShowImport(false)
      toast.success(`${imported.length} products imported`)
    } catch {
      toast.error('Failed to parse file')
    }
  }

  const deleteProduct = (id) => {
    setProducts(products.filter((p) => p.id !== id))
    toast.success('Product deleted')
  }

  const exportColumns = [
    { header: 'Name', key: 'name' },
    { header: 'SKU', key: 'sku' },
    { header: 'Barcode', key: 'barcode' },
    { header: 'Category', key: 'category' },
    { header: 'Price', key: 'price' },
    { header: 'Stock', key: 'stock' },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Inventory</h1>
          <p className="text-sm text-slate-500">Manage your products and stock levels</p>
        </div>
        <div className="flex gap-2">
          <a
            href="http://scancode.co.zw"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            Get Barcodes <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" /> Import
          </Button>
          <ExportMenu data={products} columns={exportColumns} title="Inventory" filename="tengapos_inventory" />
          <Button variant={isRestaurant ? 'restaurant' : 'primary'} onClick={() => setShowAdd(true)}>
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
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2 ${
                stat.color === 'brand' ? 'bg-brand-100 text-brand-600 dark:bg-brand-900 dark:text-brand-400' :
                stat.color === 'amber' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-400' :
                'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
              }`}>
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
      <div className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, SKU, or barcode..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                {['Product', 'SKU', 'Barcode', 'Category', 'Price', 'Stock', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <motion.tr
                  key={product.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{product.name}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{product.sku}</td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-600 dark:text-slate-400">{product.barcode}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(product.price)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      product.stock < 20
                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        : product.stock < 50
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    }`}>
                      {product.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteProduct(product.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Product">
        <form onSubmit={handleAddProduct} className="space-y-4">
          {[
            { label: 'Product Name', field: 'name', type: 'text', required: true },
            { label: 'SKU', field: 'sku', type: 'text', required: true },
            { label: 'Barcode', field: 'barcode', type: 'text', required: false },
            { label: 'Category', field: 'category', type: 'text', required: true },
            { label: 'Price', field: 'price', type: 'number', required: true },
            { label: 'Stock Quantity', field: 'stock', type: 'number', required: true },
          ].map((f) => (
            <div key={f.field}>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                {f.label}
              </label>
              <input
                type={f.type}
                value={newProduct[f.field]}
                onChange={(e) => setNewProduct({ ...newProduct, [f.field]: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required={f.required}
                step={f.type === 'number' ? '0.01' : undefined}
              />
            </div>
          ))}
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <ExternalLink className="h-3.5 w-3.5" />
            <a href="http://scancode.co.zw" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              Need barcodes? Visit scancode.co.zw
            </a>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Add Product</Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="Import Inventory">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Upload a CSV or Excel file with your inventory data. Download the template to see the required format.
          </p>
          <Button variant="secondary" onClick={generateTemplate}>
            <Download className="h-4 w-4" /> Download Template
          </Button>
          <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
            <Upload className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Drop your file here or click to browse
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleImport}
              className="mt-3 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <ExternalLink className="h-3.5 w-3.5" />
            <a href="http://scancode.co.zw" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              Need barcodes for your products?
            </a>
          </div>
        </div>
      </Modal>
    </div>
  )
}
