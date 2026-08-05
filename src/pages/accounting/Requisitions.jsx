import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Check, X } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchRequisitions, createRequisition, updateRequisitionStatus, fetchBranches } from '@/lib/db'
import { formatCurrency, formatDateTime, stripLeadingZero } from '@/utils/formatters'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  fulfilled: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
}
const BLANK = { purpose: '', amountRequested: '', notes: '', branchId: '' }

export default function Requisitions() {
  const { tenant, user, role } = useAuthStore()
  const canApprove = ['vendor', 'shop_manager'].includes(role)
  const [items, setItems] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchRequisitions(tenant.id).then(setItems).catch((err) => toast.error(err.message || 'Failed to load requisitions')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])
  useEffect(() => { if (tenant?.id) fetchBranches(tenant.id).then(setBranches).catch(() => {}) }, [tenant?.id])

  const save = async (e) => {
    e.preventDefault()
    const amount = Number(form.amountRequested)
    if (!form.purpose.trim()) { toast.error('Purpose is required'); return }
    if (!amount || amount <= 0) { toast.error('Enter an amount greater than zero'); return }
    setSaving(true)
    try {
      const created = await createRequisition(tenant.id, user?.id, { ...form, amountRequested: amount, branchId: form.branchId || null })
      setItems((prev) => [{ ...created, requester: { name: 'You' } }, ...prev])
      toast.success('Requisition submitted')
      setForm(BLANK)
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to submit')
    } finally {
      setSaving(false)
    }
  }

  const decide = async (req, status) => {
    setBusyId(req.id)
    try {
      await updateRequisitionStatus(req.id, status, user?.id)
      setItems((prev) => prev.map((r) => r.id === req.id ? { ...r, status, approver: { name: 'You' } } : r))
    } catch (err) {
      toast.error(err.message || 'Failed to update')
    } finally {
      setBusyId(null)
    }
  }

  const fmt = (n) => formatCurrency(n, tenant?.currency)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Requisitions</h2>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> New Requisition</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No requisitions yet.</div>
        ) : (
          <div className="space-y-2 p-3">
            {items.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{r.purpose}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(r.created_at)} · by {r.requester?.name || '—'}{r.notes && ` · ${r.notes}`}</p>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(r.amount_requested)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                {canApprove && r.status === 'pending' && (
                  <div className="flex gap-1">
                    <button onClick={() => decide(r, 'approved')} disabled={busyId === r.id} className="rounded-lg bg-green-600/10 p-1.5 text-green-600 hover:bg-green-600/20 disabled:opacity-50 dark:text-green-400"><Check className="h-4 w-4" /></button>
                    <button onClick={() => decide(r, 'rejected')} disabled={busyId === r.id} className="rounded-lg bg-red-600/10 p-1.5 text-red-600 hover:bg-red-600/20 disabled:opacity-50 dark:text-red-400"><X className="h-4 w-4" /></button>
                  </div>
                )}
                {canApprove && r.status === 'approved' && (
                  <button onClick={() => decide(r, 'fulfilled')} disabled={busyId === r.id} className="rounded-lg bg-blue-600/10 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-600/20 disabled:opacity-50 dark:text-blue-400">Mark Fulfilled</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Requisition">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Purpose *</label>
            <input value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} required placeholder="e.g. Office stationery restock" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount Requested</label>
            <input type="number" min="0.01" step="0.01" value={form.amountRequested} onChange={(e) => setForm((f) => ({ ...f, amountRequested: stripLeadingZero(e.target.value) }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          {branches.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Branch</label>
              <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Submitting…' : 'Submit'}</Button>
        </form>
      </Modal>
    </div>
  )
}
