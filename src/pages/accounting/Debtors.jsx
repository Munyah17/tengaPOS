import { useState, useEffect, useMemo } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchDocuments, fetchAllInvoicePaymentsForTenant, fetchCustomers, fetchManualDebtorEntries, createManualDebtorEntry, updateManualDebtorEntryStatus } from '@/lib/db'
import { formatCurrency, formatDate } from '@/utils/formatters'
import toast from 'react-hot-toast'

const BLANK = { customerId: '', description: '', amount: '', dueDate: '' }

export default function Debtors() {
  const { tenant } = useAuthStore()
  const [invoiceBalances, setInvoiceBalances] = useState([])
  const [manualEntries, setManualEntries] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    Promise.all([
      fetchDocuments(tenant.id, 'invoice'),
      fetchAllInvoicePaymentsForTenant(tenant.id),
      fetchCustomers(tenant.id),
      fetchManualDebtorEntries(tenant.id),
    ]).then(([docs, payments, custs, manual]) => {
      const paidByDoc = new Map()
      for (const p of payments) paidByDoc.set(p.document_id, (paidByDoc.get(p.document_id) || 0) + Number(p.amount))
      const byCustomer = new Map()
      for (const d of docs) {
        if (!d.customer_id) continue
        const balance = Number(d.total) - (paidByDoc.get(d.id) || 0)
        if (balance <= 0.005) continue
        const existing = byCustomer.get(d.customer_id) || { customerId: d.customer_id, balance: 0, invoiceCount: 0 }
        existing.balance += balance
        existing.invoiceCount += 1
        byCustomer.set(d.customer_id, existing)
      }
      setInvoiceBalances([...byCustomer.values()])
      setCustomers(custs)
      setManualEntries(manual)
    }).catch((err) => toast.error(err.message || 'Failed to load debtors')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const customerName = (id) => customers.find((c) => c.id === id)?.name || 'Unknown customer'
  const fmt = (n) => formatCurrency(n, tenant?.currency)
  const totalOutstanding = useMemo(() =>
    invoiceBalances.reduce((s, b) => s + b.balance, 0) + manualEntries.filter((e) => e.status === 'outstanding').reduce((s, e) => s + Number(e.amount), 0),
  [invoiceBalances, manualEntries])

  const save = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { toast.error('Enter an amount greater than zero'); return }
    setSaving(true)
    try {
      const created = await createManualDebtorEntry(tenant.id, undefined, { ...form, amount, customerId: form.customerId || null })
      setManualEntries((prev) => [created, ...prev])
      toast.success('Debtor entry added')
      setForm(BLANK)
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const settle = async (entry) => {
    try {
      await updateManualDebtorEntryStatus(entry.id, 'settled')
      setManualEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: 'settled' } : e))
    } catch (err) {
      toast.error(err.message || 'Failed to update')
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Debtors (Accounts Receivable)</h2>
          <p className="text-sm text-slate-500">Outstanding: <span className="font-bold text-slate-900 dark:text-white">{fmt(totalOutstanding)}</span></p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Manual Entry</Button>
        </div>
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">From Invoices</p>
      <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : invoiceBalances.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No outstanding invoice balances.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {invoiceBalances.map((b) => (
              <div key={b.customerId} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{customerName(b.customerId)}</p>
                  <p className="text-xs text-slate-500">{b.invoiceCount} unpaid invoice{b.invoiceCount !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(b.balance)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Manual Entries</p>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {manualEntries.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No manual debtor entries.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {manualEntries.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{e.customers?.name || customerName(e.customer_id)}</p>
                  <p className="text-xs text-slate-500">{e.description}{e.due_date && ` · due ${formatDate(e.due_date)}`}</p>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(e.amount)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${e.status === 'outstanding' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}`}>{e.status.replace('_', ' ')}</span>
                {e.status === 'outstanding' && (
                  <button onClick={() => settle(e)} className="rounded-lg bg-green-600/10 px-2.5 py-1.5 text-xs font-semibold text-green-600 hover:bg-green-600/20 dark:text-green-400">Mark Settled</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Manual Debtor Entry">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Customer</label>
            <select value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">—</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description *</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount</label>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Add Entry'}</Button>
        </form>
      </Modal>
    </div>
  )
}
