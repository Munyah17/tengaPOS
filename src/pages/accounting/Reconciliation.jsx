import { useState, useEffect } from 'react'
import { Plus, RefreshCw, Check, ArrowLeft } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import {
  fetchBankReconciliations, createBankReconciliation, fetchBankStatementLines,
  addBankStatementLine, matchBankStatementLine, unmatchBankStatementLine, fetchCashTransactions,
} from '@/lib/db'
import { formatCurrency, formatDate, toLocalDateStr } from '@/utils/formatters'
import toast from 'react-hot-toast'

const BLANK_RECON = { statementStartDate: '', statementEndDate: '', statementClosingBalance: '' }
const BLANK_LINE = { lineDate: toLocalDateStr(), description: '', amount: '' }

function ReconciliationDetail({ recon, onBack }) {
  const { tenant } = useAuthStore()
  const [lines, setLines] = useState([])
  const [cashTxns, setCashTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddLine, setShowAddLine] = useState(false)
  const [lineForm, setLineForm] = useState(BLANK_LINE)
  const [saving, setSaving] = useState(false)
  const [matchingLine, setMatchingLine] = useState(null)

  const load = () => {
    setLoading(true)
    Promise.all([fetchBankStatementLines(recon.id), fetchCashTransactions(tenant.id)])
      .then(([l, c]) => { setLines(l); setCashTxns(c.filter((t) => t.account === 'bank' || t.to_account === 'bank')) })
      .catch((err) => toast.error(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [recon.id])

  const fmt = (n) => formatCurrency(n, tenant?.currency)

  const addLine = async (e) => {
    e.preventDefault()
    const amount = Number(lineForm.amount)
    if (!amount) { toast.error('Enter a non-zero amount'); return }
    setSaving(true)
    try {
      const created = await addBankStatementLine(tenant.id, recon.id, { ...lineForm, amount })
      setLines((prev) => [...prev, created].sort((a, b) => a.line_date.localeCompare(b.line_date)))
      setLineForm(BLANK_LINE)
      setShowAddLine(false)
    } catch (err) {
      toast.error(err.message || 'Failed to add line')
    } finally {
      setSaving(false)
    }
  }

  const doMatch = async (line, cashTxnId) => {
    try {
      await matchBankStatementLine(line.id, cashTxnId)
      setLines((prev) => prev.map((l) => l.id === line.id ? { ...l, matched: true, matched_cash_transaction_id: cashTxnId } : l))
      setMatchingLine(null)
    } catch (err) {
      toast.error(err.message || 'Failed to match')
    }
  }
  const doUnmatch = async (line) => {
    try {
      await unmatchBankStatementLine(line.id)
      setLines((prev) => prev.map((l) => l.id === line.id ? { ...l, matched: false, matched_cash_transaction_id: null } : l))
    } catch (err) {
      toast.error(err.message || 'Failed to unmatch')
    }
  }

  const matchedTotal = lines.filter((l) => l.matched).reduce((s, l) => s + Number(l.amount), 0)
  const statementTotal = lines.reduce((s, l) => s + Number(l.amount), 0)

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"><ArrowLeft className="h-4 w-4" /> All Reconciliations</button>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{formatDate(recon.statement_start_date)} – {formatDate(recon.statement_end_date)}</h2>
          <p className="text-sm text-slate-500">Statement closing balance: {fmt(recon.statement_closing_balance)} · Matched: {fmt(matchedTotal)} of {fmt(statementTotal)}</p>
        </div>
        <Button variant="primary" onClick={() => setShowAddLine(true)}><Plus className="h-4 w-4" /> Add Statement Line</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
      ) : lines.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No statement lines added yet.</div>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${l.matched ? 'border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-900/10' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{l.description || '—'}</p>
                <p className="text-xs text-slate-500">{formatDate(l.line_date)}</p>
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(l.amount)}</span>
              {l.matched ? (
                <button onClick={() => doUnmatch(l)} className="flex items-center gap-1 rounded-lg bg-green-600/10 px-2.5 py-1.5 text-xs font-semibold text-green-600 hover:bg-green-600/20 dark:text-green-400"><Check className="h-3.5 w-3.5" /> Matched</button>
              ) : (
                <button onClick={() => setMatchingLine(l)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Match…</button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAddLine} onClose={() => setShowAddLine(false)} title="Add Statement Line">
        <form onSubmit={addLine} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date</label>
            <input type="date" value={lineForm.lineDate} onChange={(e) => setLineForm((f) => ({ ...f, lineDate: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Description</label>
            <input value={lineForm.description} onChange={(e) => setLineForm((f) => ({ ...f, description: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Amount (negative for outflows)</label>
            <input type="number" step="0.01" value={lineForm.amount} onChange={(e) => setLineForm((f) => ({ ...f, amount: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : 'Add Line'}</Button>
        </form>
      </Modal>

      <Modal isOpen={!!matchingLine} onClose={() => setMatchingLine(null)} title="Match to a Cash at Bank transaction">
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {cashTxns.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No Cash at Bank transactions recorded — add some in Cash Management first.</p>
          ) : cashTxns.map((t) => (
            <button key={t.id} onClick={() => doMatch(matchingLine, t.id)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-left text-sm hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-slate-800">
              <span className="text-slate-700 dark:text-slate-300">{t.description || t.type} · {formatDate(t.created_at)}</span>
              <span className="font-semibold text-slate-900 dark:text-white">{fmt(t.amount)}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}

export default function Reconciliation() {
  const { tenant } = useAuthStore()
  const [recons, setRecons] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK_RECON)
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchBankReconciliations(tenant.id).then(setRecons).catch((err) => toast.error(err.message || 'Failed to load')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const save = async (e) => {
    e.preventDefault()
    if (!form.statementStartDate || !form.statementEndDate) { toast.error('Pick a statement period'); return }
    setSaving(true)
    try {
      const created = await createBankReconciliation(tenant.id, undefined, { ...form, statementClosingBalance: Number(form.statementClosingBalance) || 0 })
      setRecons((prev) => [created, ...prev])
      toast.success('Reconciliation created')
      setForm(BLANK_RECON)
      setShowAdd(false)
      setActive(created)
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n) => formatCurrency(n, tenant?.currency)

  if (active) return <ReconciliationDetail recon={active} onBack={() => { setActive(null); load() }} />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Bank Reconciliation</h2>
          <p className="text-sm text-slate-500">Manually match Cash at Bank transactions against your bank statement</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <Button variant="primary" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> New Reconciliation</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : recons.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No reconciliations yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recons.map((r) => (
              <button key={r.id} onClick={() => setActive(r)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatDate(r.statement_start_date)} – {formatDate(r.statement_end_date)}</p>
                  <p className="text-xs text-slate-500">{r.reconciled ? 'Reconciled' : 'In progress'}</p>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{fmt(r.statement_closing_balance)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Reconciliation">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Statement Start</label>
              <input type="date" value={form.statementStartDate} onChange={(e) => setForm((f) => ({ ...f, statementStartDate: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Statement End</label>
              <input type="date" value={form.statementEndDate} onChange={(e) => setForm((f) => ({ ...f, statementEndDate: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Statement Closing Balance</label>
            <input type="number" step="0.01" value={form.statementClosingBalance} onChange={(e) => setForm((f) => ({ ...f, statementClosingBalance: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Creating…' : 'Create'}</Button>
        </form>
      </Modal>
    </div>
  )
}
