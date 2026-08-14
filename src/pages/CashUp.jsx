import { useState, useEffect } from 'react'
import { Wallet, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { formatCurrency, formatDateTime, stripLeadingZero } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchBranches } from '@/lib/dataLayer'
// Cash-Up isn't reachable from /demo -- imported straight from db.js, same
// reasoning as StockTake.jsx.
import { fetchCashUps, openCashUp, closeCashUp } from '@/lib/db'
import toast from 'react-hot-toast'

export default function CashUp() {
  const { tenant, branch, role, user } = useAuthStore()
  const canSeeAll = ['vendor', 'shop_manager', 'supervisor'].includes(role)

  const [cashUps, setCashUps] = useState([])
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState([])

  const [showOpen, setShowOpen] = useState(false)
  const [openBranchId, setOpenBranchId] = useState('')
  const [openingFloat, setOpeningFloat] = useState('')
  const [opening, setOpening] = useState(false)

  const [closeTarget, setCloseTarget] = useState(null)
  const [countedCash, setCountedCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const [closing, setClosing] = useState(false)

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    try {
      setCashUps(await fetchCashUps(tenant.id))
    } catch {
      toast.error('Failed to load cash-ups')
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [tenant?.id]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  useEffect(() => {
    if (!tenant?.id) return
    fetchBranches(tenant.id).then(setBranches).catch(() => {})
  }, [tenant?.id])

  const openToday = cashUps.find((c) => c.status === 'open')

  const handleOpen = async () => {
    const amt = Number(openingFloat)
    if (openingFloat === '' || isNaN(amt) || amt < 0) { toast.error('Enter a valid opening float'); return }
    setOpening(true)
    try {
      await openCashUp(tenant.id, openBranchId || branch?.id || null, amt)
      toast.success('Cash-up opened')
      setShowOpen(false)
      setOpeningFloat('')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to open cash-up')
    }
    setOpening(false)
  }

  const handleClose = async () => {
    const amt = Number(countedCash)
    if (countedCash === '' || isNaN(amt) || amt < 0) { toast.error('Enter a valid counted amount'); return }
    setClosing(true)
    try {
      const result = await closeCashUp(closeTarget.id, amt, closeNotes.trim() || null)
      toast[result.flagged ? 'error' : 'success'](
        result.flagged
          ? `Discrepancy flagged: ${formatCurrency(result.discrepancy, tenant?.currency)} off expected`
          : 'Cash-up closed — balanced'
      )
      setCloseTarget(null)
      setCountedCash('')
      setCloseNotes('')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to close cash-up')
    }
    setClosing(false)
  }

  const visibleCashUps = canSeeAll ? cashUps : cashUps.filter((c) => c.opened_by === user?.id)

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Cash-Up</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Daily cash reconciliation — open with a float, close with what's actually counted.
          </p>
        </div>
        {!openToday && (
          <Button onClick={() => setShowOpen(true)}>
            <Wallet className="h-4 w-4" /> Open Cash-Up
          </Button>
        )}
      </div>

      {openToday ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            Open since {formatDateTime(openToday.opened_at)} — opening float {formatCurrency(openToday.opening_float, tenant?.currency)}
          </p>
          <Button className="mt-3" variant="secondary" onClick={() => setCloseTarget(openToday)}>
            Close Cash-Up
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <Wallet className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">No cash-up open right now.</p>
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">History</h2>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…</p>
        ) : visibleCashUps.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No cash-ups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Opened', 'Branch', 'By', 'Float', 'Expected', 'Counted', 'Discrepancy'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCashUps.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 text-sm text-slate-900 dark:text-white">{formatDateTime(c.opened_at)}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{c.branches?.name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{c.opener?.name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{formatCurrency(c.opening_float, tenant?.currency)}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{c.expected_cash != null ? formatCurrency(c.expected_cash, tenant?.currency) : '—'}</td>
                    <td className="px-4 py-2 text-sm text-slate-500">{c.counted_cash != null ? formatCurrency(c.counted_cash, tenant?.currency) : '—'}</td>
                    <td className="px-4 py-2 text-sm">
                      {c.discrepancy != null ? (
                        <span className={`flex items-center gap-1 font-semibold ${c.discrepancy_flagged ? 'text-red-500' : 'text-slate-400'}`}>
                          {c.discrepancy_flagged && <AlertTriangle className="h-3.5 w-3.5" />}
                          {c.discrepancy > 0 ? '+' : ''}{formatCurrency(c.discrepancy, tenant?.currency)}
                        </span>
                      ) : c.status === 'open' ? (
                        <span className="text-xs font-semibold text-green-600 dark:text-green-400">Open</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showOpen} onClose={() => setShowOpen(false)} title="Open Cash-Up">
        <div className="space-y-3">
          {branches.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Branch</label>
              <select
                value={openBranchId}
                onChange={(e) => setOpenBranchId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">All / not branch-specific</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Opening Float</label>
            <input
              type="number" min="0" step="0.01" autoFocus
              value={openingFloat}
              onChange={(e) => setOpeningFloat(stripLeadingZero(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowOpen(false)}>Cancel</Button>
            <Button onClick={handleOpen} disabled={opening}>{opening ? 'Opening…' : 'Open'}</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!closeTarget} onClose={() => setCloseTarget(null)} title="Close Cash-Up">
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Count the drawer and enter the total cash on hand — expected cash is computed automatically from today's cash sales and refunds.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Counted Cash</label>
            <input
              type="number" min="0" step="0.01" autoFocus
              value={countedCash}
              onChange={(e) => setCountedCash(stripLeadingZero(e.target.value))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes (optional)</label>
            <textarea
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCloseTarget(null)}>Cancel</Button>
            <Button onClick={handleClose} disabled={closing}>
              {closing ? 'Closing…' : <><CheckCircle2 className="h-4 w-4" /> Close Cash-Up</>}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
