import { useState, useEffect, useMemo } from 'react'
import { Plus, RefreshCw, Undo2, AlertTriangle, Trash2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchEquipmentRentals, checkOutEquipment, returnEquipment, deleteEquipmentRental, fetchBranches } from '@/lib/db'
import { formatCurrency, formatDateTime, stripLeadingZero } from '@/utils/formatters'
import toast from 'react-hot-toast'

const tomorrow = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 16)
}
const BLANK = { itemName: '', customerName: '', customerPhone: '', dailyRate: '', depositAmount: '', dueBackAt: tomorrow(), branchId: '', notes: '' }

function ReturnModal({ rental, onClose, onDone }) {
  const [lateFee, setLateFee] = useState('0')
  const [depositReturned, setDepositReturned] = useState(true)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await returnEquipment(rental.id, { lateFee: Number(lateFee) || 0, depositReturned })
      toast.success(`${rental.item_name} checked back in`)
      onDone()
    } catch (err) {
      toast.error(err.message || 'Failed to record return')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen title={`Return: ${rental.item_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Rented to <strong>{rental.customer_name}</strong>, due back {formatDateTime(rental.due_back_at)}.
          Deposit taken: {formatCurrency(rental.deposit_amount)}.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Late fee (if any)</label>
          <input type="number" min="0" step="0.01" value={lateFee} onChange={(e) => setLateFee(stripLeadingZero(e.target.value))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={depositReturned} onChange={(e) => setDepositReturned(e.target.checked)} className="h-4 w-4 rounded" />
          Deposit returned to customer in full
        </label>
        <Button type="submit" variant="hardware" disabled={busy} className="w-full justify-center">{busy ? 'Saving…' : 'Confirm Return'}</Button>
      </form>
    </Modal>
  )
}

export default function EquipmentRental() {
  const { tenant, user, role } = useAuthStore()
  const [rentals, setRentals] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [returningTarget, setReturningTarget] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('out')

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchEquipmentRentals(tenant.id).then(setRentals).catch((err) => toast.error(err.message || 'Failed to load rentals')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])
  useEffect(() => { if (tenant?.id) fetchBranches(tenant.id).then(setBranches).catch(() => {}) }, [tenant?.id])

  const filtered = useMemo(() => {
    if (filter === 'out') return rentals.filter((r) => !r.returned_at)
    if (filter === 'overdue') return rentals.filter((r) => !r.returned_at && new Date(r.due_back_at) < new Date())
    if (filter === 'returned') return rentals.filter((r) => r.returned_at)
    return rentals
  }, [rentals, filter])

  const save = async (e) => {
    e.preventDefault()
    if (!form.itemName.trim()) { toast.error('Item name is required'); return }
    if (!form.customerName.trim()) { toast.error('Customer name is required'); return }
    if (!form.dueBackAt) { toast.error('Due-back date is required'); return }
    setSaving(true)
    try {
      const created = await checkOutEquipment(tenant.id, user?.id, {
        ...form,
        dueBackAt: new Date(form.dueBackAt).toISOString(),
        branchId: form.branchId || null,
      })
      setRentals((prev) => [created, ...prev])
      toast.success(`${form.itemName} checked out to ${form.customerName}`)
      setForm(BLANK)
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to check out equipment')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (rental) => {
    if (!window.confirm(`Delete this rental record for ${rental.item_name}? This can't be undone.`)) return
    try {
      await deleteEquipmentRental(rental.id)
      setRentals((prev) => prev.filter((r) => r.id !== rental.id))
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  const fmt = (n) => formatCurrency(n, tenant?.currency)

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Equipment Rental</h1>
          <p className="text-sm text-slate-500">Check tools and equipment out to customers, and back in</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="hardware" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Check Out Equipment</Button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {[{ key: 'out', label: 'Currently Out' }, { key: 'overdue', label: 'Overdue' }, { key: 'returned', label: 'Returned' }, { key: 'all', label: 'All' }].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${filter === f.key ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No equipment rentals here.</div>
        ) : (
          <div className="space-y-2 p-3">
            {filtered.map((r) => {
              const overdue = !r.returned_at && new Date(r.due_back_at) < new Date()
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {overdue && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />}
                      {r.item_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.customer_name}{r.customer_phone && ` · ${r.customer_phone}`} · out {formatDateTime(r.checked_out_at)}
                      {r.returned_at ? ` · returned ${formatDateTime(r.returned_at)}` : ` · due ${formatDateTime(r.due_back_at)}`}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">Deposit: {fmt(r.deposit_amount)}</span>
                  {r.returned_at ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Returned{r.late_fee > 0 ? ` · late fee ${fmt(r.late_fee)}` : ''}
                    </span>
                  ) : (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${overdue ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'}`}>
                      {overdue ? 'Overdue' : 'Out'}
                    </span>
                  )}
                  {!r.returned_at && (
                    <button onClick={() => setReturningTarget(r)} className="flex items-center gap-1 rounded-lg bg-green-600/10 px-2.5 py-1.5 text-xs font-semibold text-green-600 hover:bg-green-600/20 dark:text-green-400">
                      <Undo2 className="h-3.5 w-3.5" /> Return
                    </button>
                  )}
                  {role === 'vendor' && (
                    <button onClick={() => remove(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40" title="Delete record">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Check Out Equipment">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Item *</label>
            <input value={form.itemName} onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))} required placeholder="e.g. Concrete Mixer" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Customer *</label>
              <input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
              <input value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Daily Rate</label>
              <input type="number" min="0" step="0.01" value={form.dailyRate} onChange={(e) => setForm((f) => ({ ...f, dailyRate: stripLeadingZero(e.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Deposit</label>
              <input type="number" min="0" step="0.01" value={form.depositAmount} onChange={(e) => setForm((f) => ({ ...f, depositAmount: stripLeadingZero(e.target.value) }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Due Back *</label>
            <input type="datetime-local" value={form.dueBackAt} onChange={(e) => setForm((f) => ({ ...f, dueBackAt: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
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
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="hardware" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Check Out'}</Button>
        </form>
      </Modal>

      {returningTarget && (
        <ReturnModal
          rental={returningTarget}
          onClose={() => setReturningTarget(null)}
          onDone={() => { setReturningTarget(null); load() }}
        />
      )}
    </div>
  )
}
