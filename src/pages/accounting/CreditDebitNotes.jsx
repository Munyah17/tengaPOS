import { useState, useEffect } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchCreditDebitNotes, createCreditDebitNote, fetchCustomers, fetchSuppliers } from '@/lib/db'
import { formatCurrency, formatDate, stripLeadingZero } from '@/utils/formatters'
import toast from 'react-hot-toast'

const BLANK = { noteType: 'credit', partyType: 'customer', partyId: '', noteNumber: '', reason: '', amount: '' }

export default function CreditDebitNotes() {
  const { tenant } = useAuthStore()
  const [notes, setNotes] = useState([])
  const [customers, setCustomers] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchCreditDebitNotes(tenant.id).then(setNotes).catch((err) => toast.error(err.message || 'Failed to load notes')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])
  useEffect(() => {
    if (!tenant?.id) return
    fetchCustomers(tenant.id).then(setCustomers).catch(() => {})
    fetchSuppliers(tenant.id).then(setSuppliers).catch(() => {})
  }, [tenant?.id])

  const save = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { toast.error('Enter an amount greater than zero'); return }
    setSaving(true)
    try {
      const created = await createCreditDebitNote(tenant.id, undefined, { ...form, amount })
      setNotes((prev) => [created, ...prev])
      toast.success('Note created')
      setForm(BLANK)
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n) => formatCurrency(n, tenant?.currency)
  const partyOptions = form.partyType === 'customer' ? customers : suppliers

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Credit / Debit Notes</h2>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> New Note</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : notes.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No credit or debit notes yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Date', 'Type', 'Party', 'Reason', 'Amount'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {notes.map((n) => (
                  <tr key={n.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDate(n.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${n.note_type === 'credit' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>{n.note_type}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{n.customers?.name || n.suppliers?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{n.reason || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{fmt(n.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Credit / Debit Note">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[{ v: 'credit', l: 'Credit Note' }, { v: 'debit', l: 'Debit Note' }].map((o) => (
              <button key={o.v} type="button" onClick={() => setForm((f) => ({ ...f, noteType: o.v }))} className={`rounded-xl border-2 py-2 text-sm font-semibold ${form.noteType === o.v ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{o.l}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[{ v: 'customer', l: 'Customer' }, { v: 'supplier', l: 'Supplier' }].map((o) => (
              <button key={o.v} type="button" onClick={() => setForm((f) => ({ ...f, partyType: o.v, partyId: '' }))} className={`rounded-xl border-2 py-2 text-sm font-semibold ${form.partyType === o.v ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{o.l}</button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{form.partyType === 'customer' ? 'Customer' : 'Supplier'}</label>
            <select value={form.partyId} onChange={(e) => setForm((f) => ({ ...f, partyId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">—</option>
              {partyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Note Number</label>
              <input value={form.noteNumber} onChange={(e) => setForm((f) => ({ ...f, noteNumber: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount</label>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: stripLeadingZero(e.target.value) }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Reason</label>
            <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Create Note'}</Button>
        </form>
      </Modal>
    </div>
  )
}
