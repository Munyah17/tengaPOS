import { useState, useEffect } from 'react'
import { Factory, Trash2, RefreshCw } from 'lucide-react'
import Button from '@/components/common/Button'
import { formatDateTime } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import {
  fetchProducts, fetchBranches, fetchBillOfMaterials, saveBillOfMaterials,
  fetchProductionRuns, recordProductionRun,
} from '@/lib/db'
import toast from 'react-hot-toast'

const BLANK_COMPONENT = { component_product_id: '', qty_per_unit: '' }

export default function Production() {
  const { tenant, branch } = useAuthStore()
  const [products, setProducts] = useState([])
  const [branches, setBranches] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(false)

  const [bomProductId, setBomProductId] = useState('')
  const [bomComponents, setBomComponents] = useState([])
  const [savingBom, setSavingBom] = useState(false)

  const [runForm, setRunForm] = useState({ productId: '', qty: '', branchId: '', note: '' })
  const [recording, setRecording] = useState(false)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    Promise.all([
      fetchProducts(tenant.id),
      fetchBranches(tenant.id),
      fetchProductionRuns(tenant.id),
    ]).then(([p, b, r]) => {
      setProducts(p)
      setBranches(b)
      setRuns(r)
    }).catch(() => toast.error('Failed to load production data'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  useEffect(() => {
    if (!bomProductId || !tenant?.id) { setBomComponents([]); return }
    fetchBillOfMaterials(tenant.id, bomProductId).then((rows) => {
      setBomComponents(rows.length
        ? rows.map((r) => ({ component_product_id: r.component_product_id, qty_per_unit: r.qty_per_unit }))
        : [{ ...BLANK_COMPONENT }])
    }).catch(() => toast.error('Failed to load bill of materials'))
  }, [bomProductId, tenant?.id])

  const addComponentRow = () => setBomComponents((prev) => [...prev, { ...BLANK_COMPONENT }])
  const updateComponentRow = (i, field, val) => setBomComponents((prev) =>
    prev.map((c, idx) => (idx === i ? { ...c, [field]: val } : c)))
  const removeComponentRow = (i) => setBomComponents((prev) => prev.filter((_, idx) => idx !== i))

  const saveBom = async () => {
    if (!bomProductId) { toast.error('Choose a finished product first'); return }
    const clean = bomComponents
      .filter((c) => c.component_product_id)
      .map((c) => ({ component_product_id: c.component_product_id, qty_per_unit: Number(c.qty_per_unit) || 0 }))
    if (clean.some((c) => c.qty_per_unit <= 0)) { toast.error('Every component needs a quantity greater than zero'); return }
    if (clean.some((c) => c.component_product_id === bomProductId)) { toast.error("A product can't be a component of itself"); return }
    setSavingBom(true)
    try {
      await saveBillOfMaterials(tenant.id, bomProductId, clean)
      toast.success('Bill of materials saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save bill of materials')
    } finally {
      setSavingBom(false)
    }
  }

  const handleRecordRun = async (e) => {
    e.preventDefault()
    const qty = Number(runForm.qty)
    if (!runForm.productId) { toast.error('Choose a finished product'); return }
    if (!qty || qty <= 0) { toast.error('Enter a quantity greater than zero'); return }
    setRecording(true)
    try {
      await recordProductionRun(tenant.id, runForm.productId, qty, runForm.branchId || branch?.id || null, runForm.note.trim() || null)
      toast.success('Production run recorded — stock updated')
      setRunForm({ productId: '', qty: '', branchId: '', note: '' })
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to record production run')
    } finally {
      setRecording(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Production</h1>
          <p className="text-sm text-slate-500">Bill of materials and production runs — raw materials in, finished goods out</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bill of Materials editor */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Bill of Materials</h2>
          <p className="mb-3 text-xs text-slate-500">What it takes to make one unit of a finished product.</p>

          <label className="mb-1 block text-xs font-semibold text-slate-500">Finished Product</label>
          <select
            value={bomProductId}
            onChange={(e) => setBomProductId(e.target.value)}
            className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="">Select a product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {bomProductId && (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500">Components</label>
                <button type="button" onClick={addComponentRow} className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400">+ Add Component</button>
              </div>
              <div className="space-y-2">
                {bomComponents.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={c.component_product_id}
                      onChange={(e) => updateComponentRow(i, 'component_product_id', e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">Select component…</option>
                      {products.filter((p) => p.id !== bomProductId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input
                      type="number" min="0" step="0.001" value={c.qty_per_unit}
                      onChange={(e) => updateComponentRow(i, 'qty_per_unit', e.target.value)}
                      placeholder="Qty"
                      className="w-20 flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <button onClick={() => removeComponentRow(i)} className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="manufacturing" onClick={saveBom} disabled={savingBom}>
                  {savingBom ? 'Saving…' : 'Save Bill of Materials'}
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Record a production run */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Record Production Run</h2>
          <p className="mb-3 text-xs text-slate-500">
            Consumes the bill of materials' components from stock and adds the finished quantity — immediately, no approval step.
            If no bill of materials is set for this product, it just adds stock.
          </p>
          <form onSubmit={handleRecordRun} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Finished Product</label>
              <select
                value={runForm.productId}
                onChange={(e) => setRunForm((f) => ({ ...f, productId: e.target.value }))}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Select a product…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stock: {p.stock_qty ?? p.stock ?? 0})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Quantity Produced</label>
              <input
                type="number" min="1" step="1" value={runForm.qty}
                onChange={(e) => setRunForm((f) => ({ ...f, qty: e.target.value }))}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            {branches.length > 1 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Branch</label>
                <select
                  value={runForm.branchId}
                  onChange={(e) => setRunForm((f) => ({ ...f, branchId: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">{branch?.name ? `Current branch (${branch.name})` : 'No branch'}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Note (optional)</label>
              <input
                type="text" value={runForm.note}
                onChange={(e) => setRunForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. batch 14"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="manufacturing" disabled={recording}>
                <Factory className="h-4 w-4" /> {recording ? 'Recording…' : 'Record Production Run'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Recent production runs */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recent Production Runs</h2>
        </div>
        {runs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No production runs recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Date', 'Product', 'Qty', 'Branch', 'By', 'Note'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                    <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">{r.products?.name || '—'}</td>
                    <td className="px-4 py-2 text-sm font-semibold text-slate-900 dark:text-white">{r.qty_produced}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{r.branches?.name || '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.users?.name || '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-400">{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
