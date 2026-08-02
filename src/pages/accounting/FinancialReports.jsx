import { useState, useEffect, useMemo } from 'react'
import { RefreshCw, DollarSign, TrendingUp, TrendingDown, Wallet, Users, ArrowDownUp } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { DATE_PRESETS, getPresetRange } from '@/utils/dateRanges'
import {
  fetchOrders, fetchExpenses, fetchCashTransactions, fetchDocuments,
  fetchAllInvoicePaymentsForTenant, fetchCreditorBills, fetchAllCreditorPaymentsForTenant,
} from '@/lib/db'
import { formatCurrency } from '@/utils/formatters'
import toast from 'react-hot-toast'

export default function FinancialReports() {
  const { tenant } = useAuthStore()
  const [preset, setPreset] = useState('this_month')
  const [grossRevenue, setGrossRevenue] = useState(0)
  const [periodExpenses, setPeriodExpenses] = useState(0)
  const [cashPosition, setCashPosition] = useState(0)
  const [debtorsTotal, setDebtorsTotal] = useState(0)
  const [creditorsTotal, setCreditorsTotal] = useState(0)
  const [loadingPeriod, setLoadingPeriod] = useState(false)
  const [loadingBalances, setLoadingBalances] = useState(false)

  const range = useMemo(() => getPresetRange(preset), [preset])

  // Period-scoped figures — refetched whenever the date range changes, with
  // the range pushed into the query itself (not fetched-then-filtered), so
  // this stays cheap regardless of how much history a tenant has.
  useEffect(() => {
    if (!tenant?.id) return
    setLoadingPeriod(true)
    const fromDate = range.start.toISOString()
    const toDate = range.end.toISOString()
    Promise.all([
      fetchOrders(tenant.id, { notStatus: 'cancelled', fromDate, toDate }),
      fetchExpenses(tenant.id, { fromDate, toDate }),
    ]).then(([orders, expenses]) => {
      setGrossRevenue(orders.reduce((s, o) => s + Number(o.total), 0))
      setPeriodExpenses(expenses.reduce((s, e) => s + Number(e.amount), 0))
    }).catch((err) => toast.error(err.message || 'Failed to load report')).finally(() => setLoadingPeriod(false))
  }, [tenant?.id, range])

  // Point-in-time balances — cash position, debtors, creditors are running
  // totals as of now, not scoped to the selected period, so they only need
  // to reload on tenant change. Totals computed with one aggregate fetch
  // per source instead of one request per invoice/bill (see
  // fetchAllInvoicePaymentsForTenant / fetchAllCreditorPaymentsForTenant).
  useEffect(() => {
    if (!tenant?.id) return
    setLoadingBalances(true)
    Promise.all([
      fetchCashTransactions(tenant.id),
      fetchDocuments(tenant.id, 'invoice'),
      fetchAllInvoicePaymentsForTenant(tenant.id),
      fetchCreditorBills(tenant.id),
      fetchAllCreditorPaymentsForTenant(tenant.id),
    ]).then(([cashTxns, docs, invPayments, bills, billPayments]) => {
      setCashPosition(cashTxns.reduce((s, t) => {
        if (t.type === 'deposit') return s + Number(t.amount)
        if (t.type === 'withdrawal') return s - Number(t.amount)
        return s // transfers net to zero across both accounts
      }, 0))

      const paidByDoc = new Map()
      for (const p of invPayments) paidByDoc.set(p.document_id, (paidByDoc.get(p.document_id) || 0) + Number(p.amount))
      setDebtorsTotal(docs.reduce((s, d) => s + Math.max(0, Number(d.total) - (paidByDoc.get(d.id) || 0)), 0))

      const paidByBill = new Map()
      for (const p of billPayments) paidByBill.set(p.creditor_bill_id, (paidByBill.get(p.creditor_bill_id) || 0) + Number(p.amount))
      const payable = bills.filter((b) => b.status !== 'cancelled')
      setCreditorsTotal(payable.reduce((s, b) => s + Math.max(0, Number(b.amount) - (paidByBill.get(b.id) || 0)), 0))
    }).catch((err) => toast.error(err.message || 'Failed to load balances')).finally(() => setLoadingBalances(false))
  }, [tenant?.id])

  const netRevenue = grossRevenue - periodExpenses
  const fmt = (n) => formatCurrency(n, tenant?.currency)
  const periodLabel = DATE_PRESETS.find((p) => p.key === preset)?.label || 'Period'
  const loading = loadingPeriod || loadingBalances

  const cards = [
    { label: `Gross Revenue (${periodLabel})`, value: fmt(grossRevenue), icon: DollarSign, busy: loadingPeriod },
    { label: `Net Revenue (${periodLabel})`, value: fmt(netRevenue), icon: TrendingUp, hint: 'Gross Revenue − Expenses', busy: loadingPeriod },
    { label: `Expenses (${periodLabel})`, value: fmt(periodExpenses), icon: TrendingDown, busy: loadingPeriod },
    { label: 'Cash Position (Hand + Bank)', value: fmt(cashPosition), icon: Wallet, busy: loadingBalances },
    { label: 'Debtors Outstanding', value: fmt(debtorsTotal), icon: Users, busy: loadingBalances },
    { label: 'Creditors Outstanding', value: fmt(creditorsTotal), icon: ArrowDownUp, busy: loadingBalances },
  ]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Financial Reports</h2>
        <RefreshCw className={`h-4 w-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {DATE_PRESETS.filter((p) => p.key !== 'custom').map((p) => (
          <button key={p.key} onClick={() => setPreset(p.key)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${preset === p.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{p.label}</button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs text-slate-500"><c.icon className="h-4 w-4" /> {c.label}</div>
            <p className={`mt-2 text-xl font-extrabold text-slate-900 dark:text-white ${c.busy ? 'animate-pulse' : ''}`}>{c.value}</p>
            {c.hint && <p className="mt-1 text-[11px] text-slate-400">{c.hint}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
