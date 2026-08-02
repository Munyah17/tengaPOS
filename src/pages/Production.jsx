import { useState, useEffect, useMemo } from 'react'
import { Factory, Trash2, RefreshCw } from 'lucide-react'
import Button from '@/components/common/Button'
import ExportMenu from '@/components/common/ExportMenu'
import { formatDateTime } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { DATE_PRESETS, getPresetRange } from '@/utils/dateRanges'
import {
  fetchProducts, fetchBranches, fetchBillOfMaterials, saveBillOfMaterials,
  fetchProductionRuns, recordProductionRun, fetchProductionRunsInRange, fetchAllBillOfMaterials,
} from '@/lib/db'
import toast from 'react-hot-toast'

const BLANK_COMPONENT = { component_product_id: '', qty_per_unit: '' }

function ProductionReports({ tenantId }) {
  const [preset, setPreset] = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [runs, setRuns] = useState([])
  const [bom, setBom] = useState([])
  const [loading, setLoading] = useState(false)

  const range = useMemo(() => {
    if (preset === 'custom') {
      if (!customStart || !customEnd) return null
      const end = new Date(customEnd)
      end.setHours(23, 59, 59, 999)
      return { start: new Date(customStart), end }
    }
    return getPresetRange(preset)
  }, [preset, customStart, customEnd])

  useEffect(() => {
    if (!tenantId || !range) return
    setLoading(true)
    Promise.all([
      fetchProductionRunsInRange(tenantId, { startDate: range.start.toISOString(), endDate: range.end.toISOString() }),
      fetchAllBillOfMaterials(tenantId),
    ]).then(([r, b]) => { setRuns(r); setBom(b) })
      .catch(() => toast.error('Failed to load production report'))
      .finally(() => setLoading(false))
  }, [tenantId, range])

  const byProduct = useMemo(() => {
    const map = new Map()
    for (const r of runs) {
      const key = r.finished_product_id
      const existing = map.get(key) || { name: r.products?.name || '—', unit: r.products?.unit || '', qty: 0, runCount: 0 }
      existing.qty += Number(r.qty_produced) || 0
      existing.runCount += 1
      map.set(key, existing)
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty)
  }, [runs])

  const consumption = useMemo(() => {
    const map = new Map()
    for (const r of runs) {
      const components = bom.filter((b) => b.finished_product_id === r.finished_product_id)
      for (const c of components) {
        const key = c.component_product_id
        const existing = map.get(key) || { name: c.component?.name || '—', unit: c.component?.unit || '', qty: 0 }
        existing.qty += (Number(r.qty_produced) || 0) * (Number(c.qty_per_unit) || 0)
        map.set(key, existing)
      }
    }
    return [...map.values()].sort((a, b) => b.qty - a.qty)
  }, [runs, bom])

  const exportRows = runs.map((r) => ({
    date: formatDateTime(r.created_at),
    product: r.products?.name || '—',
    qty: r.qty_produced,
    branch: r.branches?.name || '—',
    by: r.users?.name || '—',
    note: r.note || '',
  }))
  const exportColumns = [
    { header: 'Date', key: 'date' }, { header: 'Product', key: 'product' }, { header: 'Qty', key: 'qty' },
    { header: 'Branch', key: 'branch' }, { header: 'Recorded By', key: 'by' }, { header: 'Note', key: 'note' },
  ]
  const periodLabel = DATE_PRESETS.find((p) => p.key === preset)?.label || 'Selected Period'

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                preset === p.key
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              <span className="text-xs text-slate-400">—</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </>
          )}
        </div>
        <ExportMenu data={exportRows} columns={exportColumns} title={`Production Report — ${periodLabel}`} filename="tengapos_production_report" />
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…</div>
      ) : runs.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No production runs in this period.</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Units Produced by Product</h3>
            <div className="space-y-2">
              {byProduct.map((p) => (
                <div key={p.name} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0 dark:border-slate-800">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.runCount} run{p.runCount !== 1 ? 's' : ''}</p>
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white">{p.qty} {p.unit}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Estimated Component Consumption</h3>
            {consumption.length === 0 ? (
              <p className="text-sm text-slate-400">No bill of materials defined for the products produced this period.</p>
            ) : (
              <div className="space-y-2">
                {consumption.map((c) => (
                  <div key={c.name} className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm last:border-0 dark:border-slate-800">
                    <p className="text-slate-700 dark:text-slate-300">{c.name}</p>
                    <p className="font-bold text-slate-900 dark:text-white">{c.qty.toFixed(2)} {c.unit}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

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
  const [tab, setTab] = useState('operations')

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
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            {[{ key: 'operations', label: 'Operations' }, { key: 'reports', label: 'Reports' }].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === t.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'operations' && (
            <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {tab === 'reports' ? (
        <ProductionReports tenantId={tenant?.id} />
      ) : (
      <>
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
      </>
      )}
    </div>
  )
}
