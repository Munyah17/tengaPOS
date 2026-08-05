import { useState, useEffect, useMemo } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchPettyCashTransactions, createPettyCashTransaction, fetchBranches } from '@/lib/db'
import { formatCurrency, formatDateTime, stripLeadingZero } from '@/utils/formatters'
import toast from 'react-hot-toast'

const BLANK = { type: 'topup', amount: '', description: '', branchId: '' }

export default function PettyCash() {
  const { tenant, user } = useAuthStore()
  const [txns, setTxns] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchPettyCashTransactions(tenant.id).then(setTxns).catch((err) => toast.error(err.message || 'Failed to load petty cash')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])
  useEffect(() => { if (tenant?.id) fetchBranches(tenant.id).then(setBranches).catch(() => {}) }, [tenant?.id])

  const balance = useMemo(() => txns.reduce((s, t) => s + (t.type === 'topup' ? Number(t.amount) : -Number(t.amount)), 0), [txns])
  const fmt = (n) => formatCurrency(n, tenant?.currency)

  const save = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { toast.error('Enter an amount greater than zero'); return }
    if (form.type === 'expense' && amount > balance) { toast.error(`That would exceed the current balance of ${fmt(balance)}`); return }
    setSaving(true)
    try {
      const created = await createPettyCashTransaction(tenant.id, user?.id, { branchId: form.branchId || null, type: form.type, amount, description: form.description })
      setTxns((prev) => [{ ...created, users: { name: 'You' } }, ...prev])
      toast.success(form.type === 'topup' ? 'Top-up recorded' : 'Expense recorded')
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
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Petty Cash</h2>
          <p className="text-sm text-slate-500">Balance: <span className="font-bold text-slate-900 dark:text-white">{fmt(balance)}</span></p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Transaction</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : txns.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No petty cash transactions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Date', 'Type', 'Description', 'By', 'Amount'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(t.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${t.type === 'topup' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>{t.type === 'topup' ? 'Top-up' : 'Expense'}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{t.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{t.users?.name || '—'}</td>
                    <td className={`px-4 py-3 text-sm font-semibold ${t.type === 'topup' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{t.type === 'topup' ? '+' : '-'}{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Petty Cash Transaction">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[{ v: 'topup', l: 'Top-up' }, { v: 'expense', l: 'Expense' }].map((o) => (
              <button key={o.v} type="button" onClick={() => setForm((f) => ({ ...f, type: o.v }))} className={`rounded-xl border-2 py-2.5 text-sm font-semibold ${form.type === o.v ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{o.l}</button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount</label>
            <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: stripLeadingZero(e.target.value) }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
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
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Save'}</Button>
        </form>
      </Modal>
    </div>
  )
}
