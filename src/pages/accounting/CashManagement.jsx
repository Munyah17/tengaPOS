import { useState, useEffect, useMemo } from 'react'
import { Plus, RefreshCw, HandCoins, Landmark } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchCashTransactions, createCashTransaction } from '@/lib/db'
import { formatCurrency, formatDateTime, stripLeadingZero } from '@/utils/formatters'
import toast from 'react-hot-toast'

const BLANK = { account: 'hand', type: 'deposit', toAccount: 'bank', amount: '', description: '' }

export default function CashManagement() {
  const { tenant, user } = useAuthStore()
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchCashTransactions(tenant.id).then(setTxns).catch((err) => toast.error(err.message || 'Failed to load cash transactions')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const balances = useMemo(() => {
    const b = { hand: 0, bank: 0 }
    for (const t of txns) {
      const amt = Number(t.amount)
      if (t.type === 'deposit') b[t.account] += amt
      else if (t.type === 'withdrawal') b[t.account] -= amt
      else if (t.type === 'transfer') { b[t.account] -= amt; if (t.to_account) b[t.to_account] += amt }
    }
    return b
  }, [txns])
  const fmt = (n) => formatCurrency(n, tenant?.currency)

  const save = async (e) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { toast.error('Enter an amount greater than zero'); return }
    setSaving(true)
    try {
      const created = await createCashTransaction(tenant.id, user?.id, form.type === 'transfer' ? { ...form, amount } : { ...form, toAccount: null, amount })
      setTxns((prev) => [created, ...prev])
      toast.success('Recorded')
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
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Cash Management</h2>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add Transaction</Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm text-slate-500"><HandCoins className="h-4 w-4" /> Cash at Hand</div>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">{fmt(balances.hand)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Landmark className="h-4 w-4" /> Cash at Bank</div>
          <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">{fmt(balances.bank)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : txns.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No cash transactions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Date', 'Account', 'Type', 'Description', 'Amount'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(t.created_at)}</td>
                    <td className="px-4 py-3 text-sm capitalize text-slate-700 dark:text-slate-300">{t.account}{t.type === 'transfer' && ` → ${t.to_account}`}</td>
                    <td className="px-4 py-3 text-sm capitalize text-slate-600 dark:text-slate-400">{t.type}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{t.description || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white">{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Cash Transaction">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[{ v: 'deposit', l: 'Deposit' }, { v: 'withdrawal', l: 'Withdrawal' }, { v: 'transfer', l: 'Transfer' }].map((o) => (
                <button key={o.v} type="button" onClick={() => setForm((f) => ({ ...f, type: o.v }))} className={`rounded-xl border-2 py-2 text-xs font-semibold ${form.type === o.v ? 'border-brand-600 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{o.l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{form.type === 'transfer' ? 'From Account' : 'Account'}</label>
            <select value={form.account} onChange={(e) => setForm((f) => ({ ...f, account: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="hand">Cash at Hand</option>
              <option value="bank">Cash at Bank</option>
            </select>
          </div>
          {form.type === 'transfer' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">To Account</label>
              <select value={form.toAccount} onChange={(e) => setForm((f) => ({ ...f, toAccount: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="hand">Cash at Hand</option>
                <option value="bank">Cash at Bank</option>
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount</label>
            <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: stripLeadingZero(e.target.value) }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Save'}</Button>
        </form>
      </Modal>
    </div>
  )
}
