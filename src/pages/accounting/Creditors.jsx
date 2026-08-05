import { useState, useEffect } from 'react'
import { Plus, RefreshCw, DollarSign, Loader2, Trash2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import {
  fetchCreditorBills, createCreditorBill, fetchSuppliers,
  fetchCreditorPayments, recordCreditorPayment, voidCreditorPayment,
} from '@/lib/db'
import { formatCurrency, formatDateTime, stripLeadingZero } from '@/utils/formatters'
import { PAYMENT_METHODS } from '@/utils/constants'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  unpaid: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
}
const BLANK = { supplierId: '', billNumber: '', description: '', amount: '', dueDate: '' }

function CreditorPaymentModal({ bill, currency, onClose, onPaid }) {
  const [payments, setPayments] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState(PAYMENT_METHODS[0]?.id || 'cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [voidingId, setVoidingId] = useState(null)
  const fmt = (n) => formatCurrency(n, currency)

  const load = () => {
    setLoadingPayments(true)
    fetchCreditorPayments(bill.id).then(setPayments).catch(() => toast.error('Failed to load payments')).finally(() => setLoadingPayments(false))
  }
  useEffect(load, [bill.id])

  const paidSoFar = payments.filter((p) => !p.voided_at).reduce((s, p) => s + Number(p.amount), 0)
  const balance = Number(bill.amount) - paidSoFar

  const submit = async (e) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!amt || amt <= 0) { toast.error('Enter an amount greater than zero'); return }
    if (amt > balance) { toast.error(`That would exceed the balance due of ${fmt(balance)}`); return }
    setSaving(true)
    try {
      await recordCreditorPayment(bill.id, { amount: amt, method, note: note.trim() || null })
      toast.success('Payment recorded')
      setAmount(''); setNote('')
      load()
      onPaid()
    } catch (err) {
      toast.error(err.message || 'Failed to record payment')
    } finally {
      setSaving(false)
    }
  }

  const handleVoid = async (paymentId) => {
    if (!window.confirm('Void this payment?')) return
    setVoidingId(paymentId)
    try {
      await voidCreditorPayment(paymentId)
      load()
      onPaid()
    } catch (err) {
      toast.error(err.message || 'Failed to void payment')
    } finally {
      setVoidingId(null)
    }
  }

  return (
    <Modal isOpen={!!bill} onClose={onClose} title={`Payments — ${bill.bill_number || bill.description || 'Bill'}`}>
      <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-800 dark:bg-slate-800/50">
        <div><p className="text-xs text-slate-400">Total</p><p className="font-bold text-slate-900 dark:text-white">{fmt(bill.amount)}</p></div>
        <div><p className="text-xs text-slate-400">Paid</p><p className="font-bold text-green-600 dark:text-green-400">{fmt(paidSoFar)}</p></div>
        <div><p className="text-xs text-slate-400">Balance</p><p className="font-bold text-slate-900 dark:text-white">{fmt(balance)}</p></div>
      </div>
      {balance > 0 && (
        <form onSubmit={submit} className="mb-4 space-y-3 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-3">
            <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(stripLeadingZero(e.target.value))} placeholder={fmt(balance)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Recording…' : 'Record Payment'}</Button>
        </form>
      )}
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Payment History</p>
      {loadingPayments ? (
        <div className="py-6 text-center text-sm text-slate-400"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
      ) : payments.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No payments recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className={`flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm dark:border-slate-800 ${p.voided_at ? 'opacity-50' : ''}`}>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{fmt(p.amount)} {p.voided_at && <span className="text-xs font-normal text-red-500">(voided)</span>}</p>
                <p className="text-xs text-slate-400">{formatDateTime(p.paid_at)} · {p.method} · {p.users?.name || '—'}</p>
              </div>
              {!p.voided_at && (
                <button onClick={() => handleVoid(p.id)} disabled={voidingId === p.id} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950">
                  {voidingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default function Creditors() {
  const { tenant } = useAuthStore()
  const [bills, setBills] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [payingBill, setPayingBill] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchCreditorBills(tenant.id).then(setBills).catch((err) => toast.error(err.message || 'Failed to load creditors')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])
  useEffect(() => { if (tenant?.id) fetchSuppliers(tenant.id).then(setSuppliers).catch(() => {}) }, [tenant?.id])

  const save = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { toast.error('Enter an amount greater than zero'); return }
    setSaving(true)
    try {
      const created = await createCreditorBill(tenant.id, undefined, { ...form, amount, supplierId: form.supplierId || null })
      setBills((prev) => [{ ...created, suppliers: suppliers.find((s) => s.id === form.supplierId) || null }, ...prev])
      toast.success('Bill added')
      setForm(BLANK)
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n) => formatCurrency(n, tenant?.currency)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Creditors (Accounts Payable)</h2>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Bill</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : bills.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No creditor bills yet.</div>
        ) : (
          <div className="space-y-2 p-3">
            {bills.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{b.suppliers?.name || 'Unknown supplier'}{b.bill_number && ` · ${b.bill_number}`}</p>
                  <p className="text-xs text-slate-500">{b.description}{b.due_date && ` · due ${b.due_date}`}</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${STATUS_COLORS[b.status]}`}>{b.status.replace('_', ' ')}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(b.amount)}</span>
                {b.status !== 'cancelled' && (
                  <button onClick={() => setPayingBill(b)} className="rounded-lg p-1.5 text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40" title="Record / view payments">
                    <DollarSign className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Creditor Bill">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Supplier</label>
            <select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Bill Number</label>
              <input value={form.billNumber} onChange={(e) => setForm((f) => ({ ...f, billNumber: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount</label>
            <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: stripLeadingZero(e.target.value) }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Add Bill'}</Button>
        </form>
      </Modal>

      {payingBill && (
        <CreditorPaymentModal
          bill={payingBill}
          currency={tenant?.currency}
          onClose={() => setPayingBill(null)}
          onPaid={load}
        />
      )}
    </div>
  )
}
