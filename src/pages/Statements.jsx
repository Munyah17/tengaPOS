import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileBarChart, RefreshCw, AlertTriangle } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import { useAuthStore } from '@/stores/authStore'
import { fetchCustomers, fetchCustomerStatement, fetchDocuments } from '@/lib/db'
import { formatCurrency, formatDate } from '@/utils/formatters'
import toast from 'react-hot-toast'

export default function Statements() {
  const { tenant } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const customerId = searchParams.get('customer') || ''
  const [customers, setCustomers] = useState([])
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(false)
  const [unlinkedCount, setUnlinkedCount] = useState(0)
  const fmt = (n) => formatCurrency(n, tenant?.currency)

  useEffect(() => {
    if (!tenant?.id) return
    fetchCustomers(tenant.id).then(setCustomers).catch(() => toast.error('Failed to load customers'))
    fetchDocuments(tenant.id, 'invoice')
      .then((docs) => setUnlinkedCount(docs.filter((d) => !d.customer_id).length))
      .catch(() => {})
  }, [tenant?.id])

  useEffect(() => {
    if (!tenant?.id || !customerId) { setStatement(null); return }
    setLoading(true)
    fetchCustomerStatement(tenant.id, customerId)
      .then(setStatement)
      .catch(() => toast.error('Failed to load statement'))
      .finally(() => setLoading(false))
  }, [tenant?.id, customerId])

  const rows = useMemo(() => {
    if (!statement) return []
    let running = 0
    return statement.documents.map((doc) => {
      const paid = statement.payments.filter((p) => p.document_id === doc.id).reduce((s, p) => s + Number(p.amount), 0)
      const balance = Number(doc.total) - paid
      running += balance
      return { doc, paid, balance, running }
    })
  }, [statement])

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    total: acc.total + Number(r.doc.total), paid: acc.paid + r.paid, balance: acc.balance + r.balance,
  }), { total: 0, paid: 0, balance: 0 }), [rows])

  const selectedCustomer = customers.find((c) => c.id === customerId)

  const exportRows = rows.map((r) => ({
    date: formatDate(r.doc.created_at), invoice: r.doc.doc_number, total: r.doc.total.toFixed(2),
    paid: r.paid.toFixed(2), balance: r.balance.toFixed(2), running_balance: r.running.toFixed(2),
  }))
  const exportColumns = [
    { header: 'Date', key: 'date' }, { header: 'Invoice', key: 'invoice' }, { header: 'Total', key: 'total' },
    { header: 'Paid', key: 'paid' }, { header: 'Balance', key: 'balance' }, { header: 'Running Balance', key: 'running_balance' },
  ]

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Statements</h1>
          <p className="text-sm text-slate-500">Every invoice, payment, and running balance for one customer</p>
        </div>
        {statement && rows.length > 0 && (
          <ExportMenu data={exportRows} columns={exportColumns} title={`Statement — ${selectedCustomer?.name || ''}`} filename="tengapos_statement" />
        )}
      </div>

      {unlinkedCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {unlinkedCount} invoice{unlinkedCount !== 1 ? 's' : ''} {unlinkedCount !== 1 ? "aren't" : "isn't"} linked to a customer record yet, so they won't appear on any statement — edit and re-save them to link.
        </div>
      )}

      <div className="mb-4 max-w-sm">
        <select
          value={customerId}
          onChange={(e) => setSearchParams(e.target.value ? { customer: e.target.value } : {})}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option value="">Select a customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!customerId ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-24 dark:border-slate-700">
          <FileBarChart className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500">Pick a customer above to see their statement</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No invoices for {selectedCustomer?.name || 'this customer'} yet.</div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-400">Total Invoiced</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">{fmt(totals.total)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-400">Total Paid</p>
              <p className="text-xl font-extrabold text-green-600 dark:text-green-400">{fmt(totals.paid)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-400">Balance Due</p>
              <p className="text-xl font-extrabold text-slate-900 dark:text-white">{fmt(totals.balance)}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                    {['Date', 'Invoice', 'Total', 'Paid', 'Balance', 'Running Balance'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.doc.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDate(r.doc.created_at)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{r.doc.doc_number}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{fmt(r.doc.total)}</td>
                      <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400">{fmt(r.paid)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{fmt(r.balance)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-white">{fmt(r.running)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
