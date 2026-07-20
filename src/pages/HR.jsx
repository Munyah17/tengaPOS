import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Users, DollarSign, Calendar, ChevronDown, ChevronUp, Edit2, Trash2, Download } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import {
  fetchStaffPayroll, updateStaffPay,
  fetchPayrollRuns, fetchPayrollEntries,
  savePayrollRun, deletePayrollRun,
} from '@/lib/db'
import { exportToCSV } from '@/utils/exportUtils'
import { formatCurrency } from '@/utils/formatters'
import toast from 'react-hot-toast'

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'casual', 'contract']
const PAY_TYPES       = ['monthly', 'weekly', 'hourly', 'daily']
const ET_LABELS = { full_time: 'Full Time', part_time: 'Part Time', casual: 'Casual', contract: 'Contract' }
const PT_LABELS = { monthly: 'Monthly', weekly: 'Weekly', hourly: 'Hourly', daily: 'Daily' }

const STATUS_CFG = {
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  processed: { label: 'Processed', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  paid:      { label: 'Paid',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
}

const today          = new Date().toISOString().split('T')[0]
const firstOfMonth   = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
const currentMonthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' })

// ── Pay Rate Row ───────────────────────────────────────────────────────────────
function PayRateRow({ member, onSaved }) {
  const [editing, setSaving_] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [form, setForm] = useState({
    employment_type: member.employment_type || 'full_time',
    pay_type:        member.pay_type        || 'monthly',
    base_pay:        member.base_pay        || 0,
  })

  const sel = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white'

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateStaffPay(member.id, {
        employmentType: form.employment_type,
        payType: form.pay_type,
        basePay: parseFloat(form.base_pay) || 0,
      })
      onSaved(member.id, form)
      setSaving_(false)
      toast.success(`Updated pay for ${member.name}`)
    } catch {
      toast.error('Failed to update pay rate')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-400">
            {member.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{member.name}</p>
            <p className="text-xs capitalize text-slate-500">{(member.role || '').replace('_', ' ')}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">{member.branches?.name || '—'}</td>
      <td className="px-4 py-3">
        {editing ? (
          <select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))} className={sel}>
            {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{ET_LABELS[t]}</option>)}
          </select>
        ) : <span className="text-sm text-slate-700 dark:text-slate-300">{ET_LABELS[member.employment_type || 'full_time']}</span>}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <select value={form.pay_type} onChange={e => setForm(f => ({ ...f, pay_type: e.target.value }))} className={sel}>
            {PAY_TYPES.map(t => <option key={t} value={t}>{PT_LABELS[t]}</option>)}
          </select>
        ) : <span className="text-sm text-slate-700 dark:text-slate-300">{PT_LABELS[member.pay_type || 'monthly']}</span>}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <input type="number" value={form.base_pay} step="0.01" min="0"
            onChange={e => setForm(f => ({ ...f, base_pay: e.target.value }))}
            className={`${sel} w-28`} />
        ) : <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(member.base_pay || 0)}</span>}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex gap-1.5">
            <button onClick={handleSave} disabled={saving}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {saving ? '…' : 'Save'}
            </button>
            <button onClick={() => { setSaving_(false); setForm({ employment_type: member.employment_type || 'full_time', pay_type: member.pay_type || 'monthly', base_pay: member.base_pay || 0 }) }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setSaving_(true)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
            <Edit2 className="h-3 w-3" /> Edit
          </button>
        )}
      </td>
    </tr>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function HR() {
  const { tenant, user } = useAuthStore()
  const [tab, setTab] = useState('rates')

  // ── rates tab
  const [staff, setStaff]           = useState([])
  const [staffLoading, setStaffLoad] = useState(false)

  // ── run tab
  const [run, setRun] = useState({
    id: null,
    period_label: currentMonthLabel,
    period_start: firstOfMonth,
    period_end:   today,
    pay_date:     '',
    status:       'draft',
    notes:        '',
  })
  const [entries, setEntries]     = useState([])
  const [runSaving, setRunSaving] = useState(false)

  // ── history tab
  const [history, setHistory]             = useState([])
  const [histLoading, setHistLoad]        = useState(false)
  const [expandedRun, setExpandedRun]     = useState(null)
  const [expandedEntries, setExpandedEnt] = useState([])

  const loadStaff = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(['staffPayroll', tenant.id], () => fetchStaffPayroll(tenant.id), {
      onData: (data) => {
        setStaff(data)
        setEntries(
          data
            .filter(m => m.is_active !== false)
            .map(m => ({
              user_id:          m.id,
              employee_name:    m.name,
              employment_type:  m.employment_type || 'full_time',
              pay_type:         m.pay_type        || 'monthly',
              gross_pay:        parseFloat(m.base_pay || 0).toFixed(2),
              paye:             '0.00',
              nssa:             '0.00',
              other_deductions: '0.00',
              net_pay:          parseFloat(m.base_pay || 0).toFixed(2),
              notes:            '',
            }))
        )
      },
      onError: () => toast.error('Failed to load staff'),
      onLoadingChange: setStaffLoad,
    })
  }

  const loadHistory = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(['payrollRuns', tenant.id], () => fetchPayrollRuns(tenant.id), {
      onData: setHistory,
      onError: () => toast.error('Failed to load payroll history'),
      onLoadingChange: setHistLoad,
    })
  }

  useEffect(() => { loadStaff(); loadHistory() }, [tenant?.id])

  useEffect(() => {
    const handler = () => { loadStaff(); loadHistory() }
    window.addEventListener('tengapos:force-refresh', handler)
    return () => window.removeEventListener('tengapos:force-refresh', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  const updateEntry = (idx, field, val) => {
    setEntries(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: val }
      const e    = next[idx]
      const gross = parseFloat(e.gross_pay) || 0
      const ded   = (parseFloat(e.paye) || 0) + (parseFloat(e.nssa) || 0) + (parseFloat(e.other_deductions) || 0)
      next[idx].net_pay = Math.max(0, gross - ded).toFixed(2)
      return next
    })
  }

  const handleSaveRun = async (statusOverride) => {
    if (!run.period_label || !run.period_start || !run.period_end) {
      toast.error('Fill in the period details first'); return
    }
    setRunSaving(true)
    try {
      const finalRun = { ...run, status: statusOverride || run.status }
      const newId = await savePayrollRun(tenant.id, user.id, finalRun, entries)
      setRun(r => ({ ...r, id: newId, status: finalRun.status }))
      toast.success(statusOverride === 'processed' ? 'Payroll processed!' : 'Draft saved')
      loadHistory()
      if (statusOverride === 'processed') setTab('history')
    } catch (err) {
      toast.error(err.message || 'Failed to save payroll')
    } finally {
      setRunSaving(false)
    }
  }

  const handleExpandRun = async (runId) => {
    if (expandedRun === runId) { setExpandedRun(null); return }
    setExpandedRun(runId)
    const data = await fetchPayrollEntries(runId).catch(() => [])
    setExpandedEnt(data)
  }

  const handleDeleteRun = async (runId) => {
    if (!window.confirm('Delete this payroll run and all its entries?')) return
    try {
      await deletePayrollRun(runId)
      setHistory(h => h.filter(r => r.id !== runId))
      if (expandedRun === runId) setExpandedRun(null)
      toast.success('Payroll run deleted')
    } catch {
      toast.error('Failed to delete run')
    }
  }

  const exportEntries = (ents, label) =>
    exportToCSV(
      ents.map(e => ({
        employee_name:    e.employee_name,
        employment_type:  ET_LABELS[e.employment_type] || e.employment_type,
        pay_type:         PT_LABELS[e.pay_type] || e.pay_type,
        gross_pay:        e.gross_pay,
        paye:             e.paye,
        nssa:             e.nssa,
        other_deductions: e.other_deductions,
        net_pay:          e.net_pay,
      })),
      `payroll_${label.replace(/\s+/g, '_')}`
    )

  const totalGross = entries.reduce((s, e) => s + (parseFloat(e.gross_pay) || 0), 0)
  const totalNet   = entries.reduce((s, e) => s + (parseFloat(e.net_pay)   || 0), 0)
  const totalDed   = totalGross - totalNet

  const inp  = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white'
  const cell = 'w-full rounded border border-slate-200 bg-transparent px-2 py-1 text-right text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:text-white'

  const hrUnlocked = tenant?.features?.hr_payroll === true
  if (!hrUnlocked) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">HR & Payroll</h1>
          <p className="text-sm text-slate-500">Manage staff pay rates and process payroll runs</p>
        </div>
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 dark:border-amber-700/50 dark:bg-amber-900/20">
          <h4 className="font-bold text-amber-900 dark:text-amber-200">HR & Payroll isn't active yet</h4>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            This is a paid add-on (${5}/person/month). Request it from Settings and it'll unlock here once approved.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">HR & Payroll</h1>
        <p className="text-sm text-slate-500">Manage staff pay rates and process payroll runs</p>
      </div>

      {/* Tabs — scrolls horizontally instead of clipping past the edge on
          narrow screens (the page hides overflow-x globally, so without
          this the History tab could be unreachable on mobile) */}
      <div className="mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
        {[
          { key: 'rates',   label: 'Pay Rates',    Icon: Users },
          { key: 'run',     label: 'Run Payroll',  Icon: DollarSign },
          { key: 'history', label: 'History',       Icon: Calendar },
        ].map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex flex-shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${tab === key ? 'bg-white text-slate-900 shadow dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Pay Rates ──────────────────────────────────────────── */}
      {tab === 'rates' && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <p className="text-sm text-slate-500">
              Set each employee's employment type, pay schedule, and base rate. These values auto-populate every new payroll run.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                  {['Employee', 'Branch', 'Employment Type', 'Pay Schedule', 'Base Rate', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffLoading ? (
                  <tr><td colSpan={6} className="py-16 text-center text-sm text-slate-400">Loading…</td></tr>
                ) : staff.length === 0 ? (
                  <tr><td colSpan={6} className="py-16 text-center text-sm text-slate-400">No staff found — add staff in Staff Management first.</td></tr>
                ) : staff.map(m => (
                  <PayRateRow key={m.id} member={m}
                    onSaved={(id, form) => setStaff(s => s.map(x => x.id === id ? { ...x, ...form } : x))} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Run Payroll ────────────────────────────────────────── */}
      {tab === 'run' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Pay Period</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Period Label</label>
                <input type="text" value={run.period_label} className={inp} placeholder="e.g. July 2026"
                  onChange={e => setRun(r => ({ ...r, period_label: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Start Date</label>
                <input type="date" value={run.period_start} className={inp}
                  onChange={e => setRun(r => ({ ...r, period_start: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">End Date</label>
                <input type="date" value={run.period_end} className={inp}
                  onChange={e => setRun(r => ({ ...r, period_end: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Pay Date</label>
                <input type="date" value={run.pay_date} className={inp}
                  onChange={e => setRun(r => ({ ...r, pay_date: e.target.value }))} />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">Notes (optional)</label>
              <input type="text" value={run.notes} className={inp} placeholder="e.g. Includes July bonus"
                onChange={e => setRun(r => ({ ...r, notes: e.target.value }))} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
              <p className="text-xs text-slate-500">
                Gross pay is pre-filled from staff pay rates. Edit any value inline. Net = Gross − PAYE − NSSA − Other deductions.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                    {['Employee', 'Type', 'Gross ($)', 'PAYE ($)', 'NSSA ($)', 'Other ($)', 'Net Pay ($)', 'Notes'].map(h => (
                      <th key={h} className={`px-3 py-3 ${h.includes('$') ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr><td colSpan={8} className="py-16 text-center text-sm text-slate-400">No active staff — set pay rates in the Pay Rates tab first.</td></tr>
                  ) : entries.map((e, i) => (
                    <tr key={e.user_id || i} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 text-sm font-medium text-slate-900 dark:text-white">{e.employee_name}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{ET_LABELS[e.employment_type] || e.employment_type}</td>
                      <td className="px-3 py-2"><input type="number" value={e.gross_pay} step="0.01" min="0" className={cell} onChange={ev => updateEntry(i, 'gross_pay', ev.target.value)} /></td>
                      <td className="px-3 py-2"><input type="number" value={e.paye}      step="0.01" min="0" className={cell} onChange={ev => updateEntry(i, 'paye', ev.target.value)} /></td>
                      <td className="px-3 py-2"><input type="number" value={e.nssa}      step="0.01" min="0" className={cell} onChange={ev => updateEntry(i, 'nssa', ev.target.value)} /></td>
                      <td className="px-3 py-2"><input type="number" value={e.other_deductions} step="0.01" min="0" className={cell} onChange={ev => updateEntry(i, 'other_deductions', ev.target.value)} /></td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-green-700 dark:text-green-400">{formatCurrency(parseFloat(e.net_pay) || 0)}</td>
                      <td className="px-3 py-2">
                        <input type="text" value={e.notes} placeholder="—"
                          className="w-full rounded border border-slate-200 bg-transparent px-2 py-1 text-sm text-slate-500 focus:border-brand-500 focus:outline-none dark:border-slate-700"
                          onChange={ev => updateEntry(i, 'notes', ev.target.value)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {entries.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-900/60">
                      <td colSpan={2} className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">Totals — {entries.length} employees</td>
                      <td className="px-3 py-3 text-right text-sm text-slate-900 dark:text-white">{formatCurrency(totalGross)}</td>
                      <td colSpan={3} className="px-3 py-3 text-right text-xs text-slate-500">Deductions: {formatCurrency(totalDed)}</td>
                      <td className="px-3 py-3 text-right text-sm text-green-700 dark:text-green-400">{formatCurrency(totalNet)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              <button onClick={() => handleSaveRun('draft')} disabled={runSaving || entries.length === 0}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                Save Draft
              </button>
              <button onClick={() => handleSaveRun('processed')} disabled={runSaving || entries.length === 0}
                className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {runSaving ? 'Processing…' : 'Process Payroll'}
              </button>
              <button onClick={() => exportEntries(entries, run.period_label)} disabled={entries.length === 0}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300">
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History ────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-3">
          {histLoading ? (
            <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-700">
              <Calendar className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-medium text-slate-500">No payroll runs yet</p>
              <p className="mt-1 text-xs text-slate-400">Create your first run in the Run Payroll tab</p>
            </div>
          ) : history.map(r => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{r.period_label}</p>
                    <p className="text-xs text-slate-500">{r.period_start} → {r.period_end} · {r.employee_count} employees</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CFG[r.status]?.cls || ''}`}>
                    {STATUS_CFG[r.status]?.label || r.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-slate-500">Gross</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(r.total_gross)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-slate-500">Net Pay</p>
                    <p className="text-sm font-bold text-green-700 dark:text-green-400">{formatCurrency(r.total_net)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleExpandRun(r.id)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
                      {expandedRun === r.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Details
                    </button>
                    <button onClick={() => handleDeleteRun(r.id)}
                      className="rounded-lg border border-red-200 p-1.5 text-red-500 hover:bg-red-50 dark:border-red-900/40">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {expandedRun === r.id && (
                <div className="border-t border-slate-200 dark:border-slate-800">
                  <div className="flex justify-end px-5 pt-3">
                    <button onClick={() => exportEntries(expandedEntries, r.period_label)}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
                      <Download className="h-3 w-3" /> Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto px-5 pb-4 pt-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700">
                          {['Employee', 'Type', 'Gross', 'PAYE', 'NSSA', 'Other', 'Net Pay'].map(h => (
                            <th key={h} className={`pb-2 text-xs font-semibold text-slate-500 ${h === 'Employee' || h === 'Type' ? 'text-left pr-4' : 'text-right pl-4'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {expandedEntries.map(e => (
                          <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800">
                            <td className="py-2 pr-4 font-medium text-slate-900 dark:text-white">{e.employee_name}</td>
                            <td className="py-2 pr-4 text-xs text-slate-500">{ET_LABELS[e.employment_type] || e.employment_type}</td>
                            <td className="py-2 pl-4 text-right text-slate-700 dark:text-slate-300">{formatCurrency(e.gross_pay)}</td>
                            <td className="py-2 pl-4 text-right text-slate-700 dark:text-slate-300">{formatCurrency(e.paye)}</td>
                            <td className="py-2 pl-4 text-right text-slate-700 dark:text-slate-300">{formatCurrency(e.nssa)}</td>
                            <td className="py-2 pl-4 text-right text-slate-700 dark:text-slate-300">{formatCurrency(e.other_deductions)}</td>
                            <td className="py-2 pl-4 text-right font-bold text-green-700 dark:text-green-400">{formatCurrency(e.net_pay)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
