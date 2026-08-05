import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Trash2, Loader2, X } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchBoqDocuments, createBoqDocument, deleteBoqDocument } from '@/lib/db'
import { formatCurrency, formatDate, stripLeadingZero } from '@/utils/formatters'
import toast from 'react-hot-toast'

const BLANK_ITEM = { description: '', unit: '', qty: 1, rate: 0 }
const BLANK = { boqNumber: '', title: '', clientName: '', notes: '', items: [{ ...BLANK_ITEM }] }

export default function Boq() {
  const { tenant } = useAuthStore()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchBoqDocuments(tenant.id).then(setDocs).catch((err) => toast.error(err.message || 'Failed to load BOQs')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const updateItem = (i, field, val) => setForm((f) => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [field]: val } : it) }))
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { ...BLANK_ITEM }] }))
  const removeItem = (i) => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  const total = form.items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0)

  const save = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Title is required'); return }
    const validItems = form.items.filter((it) => it.description.trim() && it.qty > 0)
    if (validItems.length === 0) { toast.error('Add at least one line item'); return }
    setSaving(true)
    try {
      const items = validItems.map((it) => ({ ...it, amount: Number(it.qty) * Number(it.rate) }))
      const created = await createBoqDocument(tenant.id, undefined, { ...form, items, total: items.reduce((s, it) => s + it.amount, 0) })
      setDocs((prev) => [created, ...prev])
      toast.success('BOQ created')
      setForm(BLANK)
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (d) => {
    if (!window.confirm(`Delete "${d.title}"?`)) return
    setDeletingId(d.id)
    try {
      await deleteBoqDocument(d.id)
      setDocs((prev) => prev.filter((x) => x.id !== d.id))
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const fmt = (n) => formatCurrency(n, tenant?.currency)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Bill of Quantities</h2>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> New BOQ</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : docs.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No bills of quantities yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {docs.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{d.title}{d.boq_number && ` · ${d.boq_number}`}</p>
                  <p className="text-xs text-slate-500">{d.client_name}{d.client_name && ' · '}{formatDate(d.created_at)} · {d.items.length} item{d.items.length !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(d.total)}</span>
                <button onClick={() => handleDelete(d)} disabled={deletingId === d.id} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950">
                  {deletingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Bill of Quantities" size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Title *</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">BOQ Number</label>
              <input value={form.boqNumber} onChange={(e) => setForm((f) => ({ ...f, boqNumber: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Client Name</label>
            <input value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Items</label>
              <button type="button" onClick={addItem} className="text-xs font-semibold text-brand-600 hover:underline">+ Add Item</button>
            </div>
            <div className="space-y-2">
              {form.items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 items-center gap-1.5">
                  <input value={it.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="Description" className="col-span-5 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <input value={it.unit} onChange={(e) => updateItem(i, 'unit', e.target.value)} placeholder="Unit" className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => updateItem(i, 'qty', stripLeadingZero(e.target.value))} placeholder="Qty" className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <input type="number" min="0" step="0.01" value={it.rate} onChange={(e) => updateItem(i, 'rate', stripLeadingZero(e.target.value))} placeholder="Rate" className="col-span-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                  <button type="button" onClick={() => removeItem(i)} className="col-span-1 flex justify-center rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end text-sm font-bold text-slate-900 dark:text-white">Total: {fmt(total)}</div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Create BOQ'}</Button>
        </form>
      </Modal>
    </div>
  )
}
