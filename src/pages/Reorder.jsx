import { useState, useEffect, useMemo } from 'react'
import { PackagePlus, FileText, Loader2 } from 'lucide-react'
import Button from '@/components/common/Button'
import { formatCurrency } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
// Reorder isn't reachable from /demo -- imported straight from db.js, same
// reasoning as StockTake.jsx/CashUp.jsx/RefundAudit.jsx.
import { fetchReorderSuggestions, createRequisition } from '@/lib/db'
import toast from 'react-hot-toast'

export default function Reorder() {
  const { tenant, branch, user } = useAuthStore()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [generating, setGenerating] = useState(false)

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    try {
      const rows = await fetchReorderSuggestions(tenant.id)
      setItems(rows)
      setSelected(new Set(rows.map((r) => r.id)))
    } catch {
      toast.error('Failed to load reorder suggestions')
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [tenant?.id]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.id)), [items, selected])
  const estimatedTotal = selectedItems.reduce((s, i) => s + (parseFloat(i.cost_price) || 0) * i.suggestedQty, 0)

  const handleGenerate = async () => {
    if (selectedItems.length === 0) { toast.error('Select at least one product'); return }
    setGenerating(true)
    try {
      const lines = selectedItems.map((i) => `${i.name}${i.sku ? ` (${i.sku})` : ''} — reorder ${i.suggestedQty} ${i.unit || 'unit'}${i.suggestedQty === 1 ? '' : 's'}`)
      await createRequisition(tenant.id, user?.id, {
        branchId: branch?.id || null,
        purpose: `Stock reorder — ${selectedItems.length} low-stock item${selectedItems.length === 1 ? '' : 's'}:\n${lines.join('\n')}`,
        amountRequested: Math.round(estimatedTotal * 100) / 100,
        notes: 'Auto-generated draft from the Reorder suggestions page.',
      })
      toast.success('Draft requisition created')
    } catch (err) {
      toast.error(err.message || 'Failed to create requisition')
    }
    setGenerating(false)
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Reorder Suggestions</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Products at or below their low-stock threshold — pick what to reorder and draft a requisition.
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={generating || selectedItems.length === 0}>
          <FileText className="h-4 w-4" /> {generating ? 'Generating…' : `Generate Draft Requisition (${selectedItems.length})`}
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
            <PackagePlus className="h-8 w-8 opacity-30" />
            <p className="text-sm">Nothing needs reordering right now.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  <th className="w-10 px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.size === items.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </th>
                  {['Product', 'Current Stock', 'Threshold', 'Suggested Reorder', 'Est. Cost'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(i.id)}
                        onChange={() => toggle(i.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm font-medium text-slate-900 dark:text-white">{i.name}</td>
                    <td className="px-4 py-2 text-sm text-red-500">{i.stock_qty ?? 0}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{i.low_stock_threshold ?? 10}</td>
                    <td className="px-4 py-2 text-sm font-semibold text-green-600 dark:text-green-400">{i.suggestedQty} {i.unit || 'unit'}{i.suggestedQty === 1 ? '' : 's'}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{formatCurrency((parseFloat(i.cost_price) || 0) * i.suggestedQty, tenant?.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-800">
                  <td colSpan={5} className="px-4 py-2 text-right text-sm font-semibold text-slate-500">Estimated total (selected)</td>
                  <td className="px-4 py-2 text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(estimatedTotal, tenant?.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
