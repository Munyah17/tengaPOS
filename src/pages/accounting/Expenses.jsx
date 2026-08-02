import { useState, useEffect, useMemo } from 'react'
import { Plus, RefreshCw, Trash2, Loader2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import ExportMenu from '@/components/common/ExportMenu'
import { useAuthStore } from '@/stores/authStore'
import { fetchExpenses, createExpense, deleteExpense, fetchSuppliers, fetchBranches } from '@/lib/db'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { PAYMENT_METHODS } from '@/utils/constants'
import toast from 'react-hot-toast'

const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Repairs & Maintenance', 'Stationery', 'Marketing', 'Insurance', 'Other']
const BLANK = { date: new Date().toISOString().slice(0, 10), category: CATEGORIES[0], description: '', amount: '', paymentMethod: PAYMENT_METHODS[0]?.id || 'cash', supplierId: '', branchId: '' }

export default function Expenses() {
  const { tenant } = useAuthStore()
  const [expenses, setExpenses] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchExpenses(tenant.id).then(setExpenses).catch((err) => toast.error(err.message || 'Failed to load expenses')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])
  useEffect(() => {
    if (!tenant?.id) return
    fetchSuppliers(tenant.id).then(setSuppliers).catch(() => {})
    fetchBranches(tenant.id).then(setBranches).catch(() => {})
  }, [tenant?.id])

  const save = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { toast.error('Enter an amount greater than zero'); return }
    setSaving(true)
    try {
      const created = await createExpense(tenant.id, undefined, { ...form, amount, supplierId: form.supplierId || null })
      setExpenses((prev) => [{ ...created, suppliers: suppliers.find((s) => s.id === form.supplierId) || null }, ...prev])
      toast.success('Expense recorded')
      setForm(BLANK)
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to record expense')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (exp) => {
    if (!window.confirm('Delete this expense?')) return
    setDeletingId(exp.id)
    try {
      await deleteExpense(exp.id)
      setExpenses((prev) => prev.filter((e) => e.id !== exp.id))
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  const total = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses])
  const fmt = (n) => formatCurrency(n, tenant?.currency)
  const exportRows = expenses.map((e) => ({ date: formatDate(e.expense_date), category: e.category, description: e.description || '', supplier: e.suppliers?.name || '', amount: e.amount, method: e.payment_method || '' }))
  const exportColumns = [{ header: 'Date', key: 'date' }, { header: 'Category', key: 'category' }, { header: 'Description', key: 'description' }, { header: 'Supplier', key: 'supplier' }, { header: 'Amount', key: 'amount' }, { header: 'Method', key: 'method' }]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Expenses</h2>
          <p className="text-sm text-slate-500">Total: <span className="font-bold text-slate-900 dark:text-white">{fmt(total)}</span></p>
        </div>
        <div className="flex gap-2">
          <ExportMenu data={exportRows} columns={exportColumns} title="Expenses" filename="tengapos_expenses" />
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Expense</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Date', 'Category', 'Description', 'Supplier', 'Method', 'Amount', ''].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">No expenses recorded yet.</td></tr>
                ) : expenses.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDate(e.expense_date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{e.category}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{e.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{e.suppliers?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 capitalize">{e.payment_method || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{fmt(e.amount)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleDelete(e)} disabled={deletingId === e.id} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950">
                        {deletingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Expense">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount</label>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Payment Method</label>
              <select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>
          {suppliers.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Supplier (optional)</label>
              <select value={form.supplierId} onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {branches.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Branch</label>
              <select value={form.branchId} onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="">—</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Add Expense'}</Button>
        </form>
      </Modal>
    </div>
  )
}
