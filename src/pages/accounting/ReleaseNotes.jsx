import { useState, useEffect } from 'react'
import { Plus, RefreshCw, X } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchReleaseNotes, createReleaseNote, fetchCustomers } from '@/lib/db'
import { formatDate, stripLeadingZero } from '@/utils/formatters'
import toast from 'react-hot-toast'

const BLANK_ITEM = { description: '', qty: 1, unit: '' }
const BLANK = { releaseNumber: '', customerId: '', issuedTo: '', notes: '', items: [{ ...BLANK_ITEM }] }

export default function ReleaseNotes() {
  const { tenant } = useAuthStore()
  const [notes, setNotes] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchReleaseNotes(tenant.id).then(setNotes).catch((err) => toast.error(err.message || 'Failed to load release notes')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])
  useEffect(() => { if (tenant?.id) fetchCustomers(tenant.id).then(setCustomers).catch(() => {}) }, [tenant?.id])

  const updateItem = (i, field, val) => setForm((f) => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [field]: val } : it) }))
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { ...BLANK_ITEM }] }))
  const removeItem = (i) => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))

  const save = async (e) => {
    e.preventDefault()
    const validItems = form.items.filter((it) => it.description.trim() && it.qty > 0)
    if (validItems.length === 0) { toast.error('Add at least one item'); return }
    if (!form.customerId && !form.issuedTo.trim()) { toast.error('Pick a customer or type who this was issued to'); return }
    setSaving(true)
    try {
      const created = await createReleaseNote(tenant.id, undefined, { ...form, items: validItems, status: 'released', customerId: form.customerId || null })
      setNotes((prev) => [{ ...created, customers: customers.find((c) => c.id === form.customerId) || null }, ...prev])
      toast.success('Release note created')
      setForm(BLANK)
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Release Notes</h2>
          <p className="text-sm text-slate-500">Goods-issued tracking — does not affect inventory stock</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> New Release Note</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : notes.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No release notes yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notes.map((n) => (
              <div key={n.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{n.customers?.name || n.issued_to}{n.release_number && ` · ${n.release_number}`}</p>
                <p className="text-xs text-slate-500">{formatDate(n.created_at)} · {n.items.map((it) => `${it.description} x${it.qty}`).join(', ')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Release Note">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Release Number</label>
              <input value={form.releaseNumber} onChange={(e) => setForm((f) => ({ ...f, releaseNumber: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Customer</label>
              <select value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">—</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Issued To (if not a customer above)</label>
            <input value={form.issuedTo} onChange={(e) => setForm((f) => ({ ...f, issuedTo: e.target.value }))} placeholder="e.g. Warehouse team, department name" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Items</label>
              <button type="button" onClick={addItem} className="text-xs font-semibold text-brand-600 hover:underline">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="Description" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => updateItem(i, 'qty', stripLeadingZero(e.target.value))} placeholder="Qty" className="w-20 flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <input value={it.unit} onChange={(e) => updateItem(i, 'unit', e.target.value)} placeholder="Unit" className="w-20 flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <button type="button" onClick={() => removeItem(i)} className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Create Release Note'}</Button>
        </form>
      </Modal>
    </div>
  )
}
