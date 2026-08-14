import { useState, useEffect } from 'react'
import { AlertTriangle, ShieldAlert, Loader2, TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/utils/formatters'
import { DATE_PRESETS, getPresetRange } from '@/utils/dateRanges'
import { useAuthStore } from '@/stores/authStore'
// Refund Auditing isn't reachable from /demo -- imported straight from
// db.js, same reasoning as StockTake.jsx/CashUp.jsx.
import { fetchRefundAuditData } from '@/lib/db'
import toast from 'react-hot-toast'

export default function RefundAudit() {
  const { tenant } = useAuthStore()
  const [preset, setPreset] = useState('this_month')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenant?.id) return
    setLoading(true) // eslint-disable-line react-hooks/set-state-in-effect -- re-shows loading on preset change
    const { start, end } = getPresetRange(preset === 'custom' ? 'this_month' : preset)
    fetchRefundAuditData(tenant.id, { startDate: start.toISOString(), endDate: end.toISOString() })
      .then(setData)
      .catch(() => toast.error('Failed to load refund audit data'))
      .finally(() => setLoading(false))
  }, [tenant?.id, preset])

  const cashiers = data?.cashiers || []
  const outliers = cashiers.filter((c) => c.outlier)
  const sameActorFlags = data?.sameActorFlags || []

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Refund Auditing</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Refund/void patterns by cashier — for spotting fraud, not for chasing honest mistakes.
          </p>
        </div>
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          {DATE_PRESETS.filter((p) => p.key !== 'custom').map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…</p>
      ) : (
        <>
          {(outliers.length > 0 || sameActorFlags.length > 0) && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                <h2 className="text-sm font-bold text-red-800 dark:text-red-300">Flags Worth Reviewing</h2>
              </div>
              <ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-400">
                {outliers.map((c) => (
                  <li key={c.userId}>
                    <b>{c.name}</b>'s refund rate ({c.refundRate.toFixed(1)}%) is well above the team average — worth a closer look.
                  </li>
                ))}
                {sameActorFlags.map((f) => (
                  <li key={`${f.type}-${f.id}`}>
                    Order {f.orderNo || '—'}: the same person both requested and approved this {f.type} — normally two different people.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                <TrendingUp className="h-4 w-4" /> By Cashier
              </h2>
            </div>
            {cashiers.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No sales or refunds in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                      {['Cashier', 'Sales', 'Refunds/Voids', 'Refund Value', 'Refund Rate'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cashiers.map((c) => (
                      <tr key={c.userId} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-2 text-sm font-medium text-slate-900 dark:text-white">
                          <span className="flex items-center gap-1.5">
                            {c.outlier && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                            {c.name}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-slate-500">{formatCurrency(c.salesTotal, tenant?.currency)}</td>
                        <td className="px-4 py-2 text-sm text-slate-500">{c.refundCount}</td>
                        <td className="px-4 py-2 text-sm text-slate-500">{formatCurrency(c.refundValue, tenant?.currency)}</td>
                        <td className={`px-4 py-2 text-sm font-semibold ${c.outlier ? 'text-red-500' : 'text-slate-500'}`}>
                          {c.refundRate.toFixed(1)}%
                        </td>
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
