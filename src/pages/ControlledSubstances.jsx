import { useState, useEffect, useMemo } from 'react'
import { ShieldAlert, RefreshCw } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import DateInput from '@/components/common/DateInput'
import { formatDateTime } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchControlledSubstanceLedger } from '@/lib/db'
import toast from 'react-hot-toast'

const TYPE_BADGE = {
  Dispensed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  Received: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  Adjusted: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
}

const exportColumns = [
  { header: 'Date', key: 'dateLabel' },
  { header: 'Product', key: 'product' },
  { header: 'Type', key: 'type' },
  { header: 'Qty', key: 'qty' },
  { header: 'Running Balance', key: 'balance' },
  { header: 'Schedule', key: 'schedule' },
  { header: 'By', key: 'by' },
]

// Compliance report only -- no new ledger. Unions the tables that already
// record every controlled-substance movement (dispense/receive/adjust) and
// keeps a running per-product balance, so nothing here can drift from the
// real stock history it's built on.
export default function ControlledSubstances() {
  const { tenant } = useAuthStore()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchControlledSubstanceLedger(tenant.id, {
      startDate: dateFrom ? `${dateFrom}T00:00:00` : undefined,
      endDate: dateTo ? `${dateTo}T23:59:59.999` : undefined,
    }).then(setRows).catch((err) => toast.error(err.message || 'Failed to load controlled-substance register')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id, dateFrom, dateTo])

  const withBalances = useMemo(() => {
    const running = {}
    return rows.map((r) => {
      running[r.product] = (running[r.product] || 0) + r.qty
      return { ...r, dateLabel: formatDateTime(r.date), balance: running[r.product] }
    })
  }, [rows])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <ShieldAlert className="h-5 w-5 text-brand-600" /> Controlled Substances
          </h1>
          <p className="text-sm text-slate-500">Running audit trail for every controlled-substance movement — dispensed, received, and adjusted.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" className="w-36" />
          <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" className="w-36" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-400 hover:text-red-500">Clear</button>
          )}
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <ExportMenu data={withBalances} columns={exportColumns} title="Controlled Substances Register" filename="tengapos_controlled_substances" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                {['Date', 'Product', 'Type', 'Qty', 'Running Balance', 'Schedule', 'By'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : withBalances.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">No controlled-substance movements recorded yet.</td></tr>
              ) : withBalances.map((r) => {
                const badge = TYPE_BADGE[r.type]
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.dateLabel}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{r.product}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge?.bg || 'bg-slate-100 dark:bg-slate-800'} ${badge?.text || 'text-slate-600 dark:text-slate-400'}`}>{r.type}</span>
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium ${r.qty < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{r.qty > 0 ? '+' : ''}{r.qty}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{r.balance}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.schedule || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.by}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
