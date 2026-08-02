import { useState, useEffect, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import { useAuthStore } from '@/stores/authStore'
import { DATE_PRESETS, getPresetRange } from '@/utils/dateRanges'
import {
  fetchOrders, fetchExpenses, fetchPettyCashTransactions, fetchCashTransactions,
} from '@/lib/db'
import { formatCurrency, formatDateTime } from '@/utils/formatters'
import toast from 'react-hot-toast'

export default function Ledger() {
  const { tenant } = useAuthStore()
  const [preset, setPreset] = useState('this_month')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  const range = useMemo(() => getPresetRange(preset), [preset])

  // Range is pushed into every query instead of fetched-then-filtered, so
  // this stays cheap regardless of how much history a tenant has — a
  // "This Year" selection queries a year of rows, not the entire lifetime.
  useEffect(() => {
    if (!tenant?.id) return
    setLoading(true)
    const fromDate = range.start.toISOString()
    const toDate = range.end.toISOString()
    Promise.all([
      fetchOrders(tenant.id, { notStatus: 'cancelled', fromDate, toDate }),
      fetchExpenses(tenant.id, { fromDate, toDate }),
      fetchPettyCashTransactions(tenant.id, { fromDate, toDate }),
      fetchCashTransactions(tenant.id, { fromDate, toDate }),
    ]).then(([orders, expenses, petty, cash]) => {
      const entries = [
        ...orders.map((o) => ({ date: o.created_at, type: 'Sale', description: o.order_no || o.id, amount: Number(o.total), direction: 'in' })),
        ...expenses.map((e) => ({ date: e.expense_date, type: 'Expense', description: `${e.category}${e.description ? ` — ${e.description}` : ''}`, amount: Number(e.amount), direction: 'out' })),
        ...petty.map((p) => ({ date: p.created_at, type: `Petty Cash ${p.type === 'topup' ? 'Top-up' : 'Expense'}`, description: p.description || '', amount: Number(p.amount), direction: p.type === 'topup' ? 'in' : 'out' })),
        ...cash.map((c) => ({ date: c.created_at, type: `Cash ${c.type}`, description: `${c.account}${c.to_account ? ` → ${c.to_account}` : ''}${c.description ? ` — ${c.description}` : ''}`, amount: Number(c.amount), direction: c.type === 'withdrawal' ? 'out' : 'in' })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date))
      setRows(entries)
    }).catch((err) => toast.error(err.message || 'Failed to load ledger')).finally(() => setLoading(false))
  }, [tenant?.id, range])

  const fmt = (n) => formatCurrency(n, tenant?.currency)
  const netTotal = rows.reduce((s, r) => s + (r.direction === 'in' ? r.amount : -r.amount), 0)
  const exportRows = rows.map((r) => ({ date: formatDateTime(r.date), type: r.type, description: r.description, direction: r.direction, amount: r.amount }))
  const exportColumns = [{ header: 'Date', key: 'date' }, { header: 'Type', key: 'type' }, { header: 'Description', key: 'description' }, { header: 'In/Out', key: 'direction' }, { header: 'Amount', key: 'amount' }]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Ledger</h2>
          <p className="text-sm text-slate-500">
            All Sales, Expenses, Petty Cash, and Cash Management activity in one feed. Net for period: <span className={`font-bold ${netTotal >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{fmt(netTotal)}</span>
          </p>
        </div>
        <ExportMenu data={exportRows} columns={exportColumns} title="Ledger" filename="tengapos_ledger" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {DATE_PRESETS.filter((p) => p.key !== 'custom').map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${preset === p.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{p.label}</button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No activity in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Date', 'Type', 'Description', 'Amount'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(r.date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{r.type}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.description}</td>
                    <td className={`px-4 py-3 text-sm font-semibold ${r.direction === 'in' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{r.direction === 'in' ? '+' : '-'}{fmt(r.amount)}</td>
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
