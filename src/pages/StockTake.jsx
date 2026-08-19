import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, Search, Plus, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { formatDateTime } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchProducts, fetchBranches } from '@/lib/dataLayer'
// Stock Take isn't reachable from /demo (not one of the 7 sandboxed core
// pages) -- imported straight from db.js rather than dataLayer.js so it
// can never accidentally resolve to a demo stub that doesn't exist.
import {
  fetchStockTakes, fetchStockTakeCounts, startStockTake, recordStockTakeCount, finalizeStockTake,
} from '@/lib/db'
import { queueOfflineAction } from '@/lib/offlineSync'
import { isNetworkError } from '@/lib/authRetry'
import toast from 'react-hot-toast'

export default function StockTake() {
  const { tenant, branch, role } = useAuthStore()
  const queryClient = useQueryClient()
  const canManage = ['vendor', 'shop_manager', 'supervisor'].includes(role)

  const [stockTakes, setStockTakes] = useState([])
  const [loadingTakes, setLoadingTakes] = useState(true)
  const [showStart, setShowStart] = useState(false)
  const [startBranchId, setStartBranchId] = useState('')
  const [startNote, setStartNote] = useState('')
  const [starting, setStarting] = useState(false)
  const [branches, setBranches] = useState([])

  const [activeTake, setActiveTake] = useState(null) // the open stock_take row being counted into
  const [counts, setCounts] = useState([])
  const [search, setSearch] = useState('')
  const [countValue, setCountValue] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false)

  const loadTakes = async () => {
    if (!tenant?.id) return
    setLoadingTakes(true)
    try {
      const rows = await fetchStockTakes(tenant.id)
      setStockTakes(rows)
      const open = rows.find((r) => r.status === 'open')
      setActiveTake(open || null)
    } catch {
      toast.error('Failed to load stock takes')
    }
    setLoadingTakes(false)
  }
  useEffect(() => { loadTakes() }, [tenant?.id]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  useEffect(() => {
    if (!tenant?.id) return
    fetchBranches(tenant.id).then(setBranches).catch(() => {})
  }, [tenant?.id])

  const loadCounts = async (takeId) => {
    if (!takeId) { setCounts([]); return }
    try {
      setCounts(await fetchStockTakeCounts(takeId))
    } catch {
      toast.error('Failed to load counts')
    }
  }
  useEffect(() => { loadCounts(activeTake?.id) }, [activeTake?.id]) // eslint-disable-line react-hooks/set-state-in-effect

  const { data: products = [] } = useQuery({
    queryKey: ['products', tenant?.id],
    queryFn: () => fetchProducts(tenant.id),
    enabled: !!tenant?.id,
  })

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return products
      .filter((p) => !p.is_service && (p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)))
      .slice(0, 8)
  }, [products, search])

  const handleStart = async () => {
    setStarting(true)
    try {
      const id = await startStockTake(tenant.id, startBranchId || branch?.id || null, startNote.trim() || null)
      toast.success('Stock take started')
      setShowStart(false)
      setStartNote('')
      await loadTakes()
      setActiveTake({ id })
    } catch (err) {
      toast.error(err.message || 'Failed to start stock take')
    }
    setStarting(false)
  }

  const handleRecordCount = async () => {
    if (!selectedProductId) { toast.error('Pick a product first'); return }
    const qty = Number(countValue)
    if (countValue === '' || isNaN(qty) || qty < 0) { toast.error('Enter a valid counted quantity'); return }
    setSaving(true)
    try {
      await recordStockTakeCount(activeTake.id, selectedProductId, qty)
      toast.success('Count recorded')
      setSearch('')
      setSelectedProductId('')
      setCountValue('')
      loadCounts(activeTake.id)
    } catch (err) {
      if (isNetworkError(err)) {
        // Safe to queue: record_stock_take_count upserts by (stock_take_id,
        // product_id), so a replay after reconnecting just lands the same
        // count -- counting into an already-started session works fine
        // offline, only starting/finalizing the session itself needs a
        // live connection.
        await queueOfflineAction('stock_take_count', { stockTakeId: activeTake.id, productId: selectedProductId, countedQty: qty, note: null })
        const p = products.find((pr) => pr.id === selectedProductId)
        setCounts((prev) => [
          { id: `offline-${Date.now()}`, product_id: selectedProductId, products: p ? { name: p.name } : null, system_qty: p?.stock ?? p?.stock_qty ?? 0, counted_qty: qty, counted_at: new Date().toISOString() },
          ...prev,
        ])
        setSearch('')
        setSelectedProductId('')
        setCountValue('')
        toast('Offline — count saved, will sync automatically', { icon: '📴' })
      } else {
        toast.error(err.message || 'Failed to record count')
      }
    }
    setSaving(false)
  }

  const handleFinalize = async () => {
    setFinalizing(true)
    try {
      const result = await finalizeStockTake(activeTake.id)
      toast.success(`Stock take finalized — ${result.products_counted} product(s) adjusted`)
      setShowFinalizeConfirm(false)
      setActiveTake(null)
      queryClient.invalidateQueries({ queryKey: ['products', tenant.id] })
      loadTakes()
    } catch (err) {
      toast.error(err.message || 'Failed to finalize stock take')
    }
    setFinalizing(false)
  }

  const variancesOnly = counts.filter((c) => Number(c.counted_qty) !== Number(c.system_qty))

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Stock Take</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Physical count vs system count — catches shrinkage before it becomes a habit.
          </p>
        </div>
        {canManage && !activeTake && (
          <Button onClick={() => setShowStart(true)}>
            <Plus className="h-4 w-4" /> Start New Stock Take
          </Button>
        )}
      </div>

      {activeTake ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Stock take in progress — {counts.length} product{counts.length === 1 ? '' : 's'} counted so far.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Count a Product</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setSelectedProductId('') }}
                placeholder="Search product by name or SKU…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            {filteredProducts.length > 0 && !selectedProductId && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProductId(p.id); setSearch(p.name) }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className="text-slate-900 dark:text-white">{p.name}</span>
                    <span className="text-xs text-slate-400">System: {p.stock}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedProductId && (
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Counted Quantity</label>
                  <input
                    type="number"
                    min="0"
                    autoFocus
                    value={countValue}
                    onChange={(e) => setCountValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRecordCount() }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <Button onClick={handleRecordCount} disabled={saving}>
                  {saving ? 'Saving…' : 'Record Count'}
                </Button>
              </div>
            )}
          </div>

          {counts.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Counted So Far {variancesOnly.length > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400">({variancesOnly.length} with variance)</span>}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                      {['Product', 'System', 'Counted', 'Variance'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {counts.map((c) => {
                      const variance = Number(c.counted_qty) - Number(c.system_qty)
                      return (
                        <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="px-4 py-2 text-sm text-slate-900 dark:text-white">{c.products?.name || '—'}</td>
                          <td className="px-4 py-2 text-sm text-slate-500">{c.system_qty}</td>
                          <td className="px-4 py-2 text-sm text-slate-500">{c.counted_qty}</td>
                          <td className={`px-4 py-2 text-sm font-semibold ${variance === 0 ? 'text-slate-400' : variance > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                            {variance > 0 ? '+' : ''}{variance}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {canManage && (
            <div className="flex justify-end">
              <Button variant="danger" onClick={() => setShowFinalizeConfirm(true)} disabled={counts.length === 0}>
                <CheckCircle2 className="h-4 w-4" /> Finalize Stock Take
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No stock take in progress right now.</p>
        </div>
      )}

      {stockTakes.filter((t) => t.status === 'completed').length > 0 && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Past Stock Takes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Started', 'Branch', 'Started By', 'Completed By', 'Note'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockTakes.filter((t) => t.status === 'completed').map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 text-sm text-slate-900 dark:text-white">{formatDateTime(t.started_at)}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{t.branches?.name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{t.starter?.name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{t.completer?.name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{t.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {loadingTakes && <p className="mt-4 text-center text-sm text-slate-400"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…</p>}

      <Modal isOpen={showStart} onClose={() => setShowStart(false)} title="Start New Stock Take">
        <div className="space-y-3">
          {branches.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Branch</label>
              <select
                value={startBranchId}
                onChange={(e) => setStartBranchId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">All / not branch-specific</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Note (optional)</label>
            <textarea
              value={startNote}
              onChange={(e) => setStartNote(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowStart(false)}>Cancel</Button>
            <Button onClick={handleStart} disabled={starting}>{starting ? 'Starting…' : 'Start'}</Button>
          </div>
        </div>
      </Modal>

      {showFinalizeConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Finalize Stock Take?</h3>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              This applies every counted variance to live stock levels ({variancesOnly.length} product{variancesOnly.length === 1 ? '' : 's'} will change). This can't be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowFinalizeConfirm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {finalizing ? 'Finalizing…' : 'Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
