import { motion } from 'framer-motion'
import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, X } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import { formatCurrency, formatDateTime } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchTransactions } from '@/lib/db'

const DEMO_TRANSACTIONS = [
  { id: 'TP-260524-0001', date: '2026-05-24T14:30:00', cashier: 'Grace K.', items: 3, subtotal: 13.48, tax: 2.02, total: 15.50, method: 'Cash', branch: 'Main' },
  { id: 'TP-260524-0002', date: '2026-05-24T14:22:00', cashier: 'Tatenda M.', items: 7, subtotal: 37.17, tax: 5.58, total: 42.75, method: 'EcoCash', branch: 'Main' },
  { id: 'TP-260524-0003', date: '2026-05-24T14:15:00', cashier: 'Grace K.', items: 2, subtotal: 7.13, tax: 1.07, total: 8.20, method: 'Cash', branch: 'CBD' },
  { id: 'TP-260524-0004', date: '2026-05-24T14:08:00', cashier: 'Farai N.', items: 12, subtotal: 59.04, tax: 8.86, total: 67.90, method: 'Visa', branch: 'Main' },
  { id: 'TP-260524-0005', date: '2026-05-24T13:55:00', cashier: 'Grace K.', items: 4, subtotal: 20.00, tax: 3.00, total: 23.00, method: 'InnBucks', branch: 'Mall' },
]

const exportColumns = [
  { header: 'Receipt #', key: 'id' },
  { header: 'Date', key: 'date' },
  { header: 'Cashier', key: 'cashier' },
  { header: 'Items', key: 'items' },
  { header: 'Subtotal', key: 'subtotal' },
  { header: 'Tax', key: 'tax' },
  { header: 'Total', key: 'total' },
  { header: 'Method', key: 'method' },
  { header: 'Branch', key: 'branch' },
]

export default function Transactions() {
  const { isDemo, tenant } = useAuthStore()
  const [liveTransactions, setLiveTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const load = () => {
    if (isDemo || !tenant?.id) return
    setLoading(true)
    fetchTransactions(tenant.id)
      .then(rows => setLiveTransactions(rows.map(t => ({
        id: t.reference || t.id,
        date: t.created_at,
        cashier: t.users?.name || '—',
        items: t.orders?.order_items?.reduce((s, i) => s + i.qty, 0) ?? '—',
        subtotal: t.orders?.subtotal ?? t.amount,
        tax: t.orders?.tax_amount ?? 0,
        total: parseFloat(t.amount),
        method: t.method,
        branch: t.branches?.name || '—',
      }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [isDemo, tenant?.id])

  const allTransactions = isDemo ? DEMO_TRANSACTIONS : liveTransactions

  const transactions = useMemo(() => {
    if (!dateFrom && !dateTo) return allTransactions
    return allTransactions.filter(t => {
      const d = new Date(t.date)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
      return true
    })
  }, [allTransactions, dateFrom, dateTo])

  const dateFiltered = dateFrom || dateTo

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Transactions</h1>
          <p className="text-sm text-slate-500">Detailed transaction history</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
            <span className="text-xs text-slate-500 whitespace-nowrap">From</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-transparent text-sm text-slate-900 focus:outline-none dark:text-white" />
            <span className="text-xs text-slate-400">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-transparent text-sm text-slate-900 focus:outline-none dark:text-white" />
            {dateFiltered && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="ml-1 text-slate-400 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {!isDemo && (
            <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <ExportMenu data={transactions} columns={exportColumns} title={`Transactions${dateFiltered ? ` (${dateFrom || '…'} to ${dateTo || '…'})` : ''}`} filename="tengapos_transactions" />
        </div>
      </div>
      {dateFiltered && (
        <p className="mb-4 text-xs text-slate-500">
          Showing {transactions.length} of {allTransactions.length} transactions for selected date range
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                {['Receipt #', 'Date', 'Cashier', 'Items', 'Subtotal', 'Tax', 'Total', 'Payment', 'Branch'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-sm text-slate-400">
                    No transactions yet — complete a sale on the POS to see it here.
                  </td>
                </tr>
              ) : transactions.map((t) => (
                <motion.tr
                  key={t.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3 font-mono text-sm font-medium text-slate-900 dark:text-white">{t.id}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(t.date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{t.cashier}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{t.items}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatCurrency(t.subtotal)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatCurrency(t.tax)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(t.total)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {t.method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{t.branch}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
