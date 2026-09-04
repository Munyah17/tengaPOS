import { useState, useEffect } from 'react'
import { CheckCircle2, Flag, Loader2, ShieldAlert, DoorOpen } from 'lucide-react'
import { formatDateTime } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
// Not reachable from /demo -- imported straight from db.js, same
// reasoning as StockTake.jsx/CashUp.jsx/RefundAudit.jsx.
import {
  fetchDrawerEvents, reviewDrawerEvent,
  fetchSosAlerts, resolveSosAlert,
} from '@/lib/db'
import toast from 'react-hot-toast'

const DRAWER_REASONS = {
  change: 'Making change',
  till_float: 'Till float adjustment',
  other: 'Other',
}

function StatusBadge({ status }) {
  const cls = status === 'approved'
    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
    : status === 'flagged'
      ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${cls}`}>{status}</span>
}

// Drawer-open + SOS oversight in one page -- both are the same "closing
// a leak that had zero visibility before" family, and neither is big
// enough on its own to earn a separate nav entry.
export default function Security() {
  const { tenant } = useAuthStore()
  const [tab, setTab] = useState('drawer')
  const [events, setEvents] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState(null)
  const [flagTarget, setFlagTarget] = useState(null)
  const [flagNote, setFlagNote] = useState('')
  const [resolveTarget, setResolveTarget] = useState(null)
  const [resolveNote, setResolveNote] = useState('')

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    Promise.all([fetchDrawerEvents(tenant.id), fetchSosAlerts(tenant.id)])
      .then(([e, a]) => { setEvents(e); setAlerts(a) })
      .catch(() => toast.error('Failed to load security log'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const approveDrawer = async (id) => {
    setActioningId(id)
    try {
      await reviewDrawerEvent(id, 'approve', null)
      toast.success('Drawer open approved')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to approve')
    } finally {
      setActioningId(null)
    }
  }

  const submitFlagDrawer = async () => {
    if (!flagNote.trim()) { toast.error('A note is required to flag a drawer event'); return }
    setActioningId(flagTarget)
    try {
      await reviewDrawerEvent(flagTarget, 'flag', flagNote.trim())
      toast.success('Drawer event flagged for follow-up')
      setFlagTarget(null)
      setFlagNote('')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to flag')
    } finally {
      setActioningId(null)
    }
  }

  const submitResolveSos = async () => {
    setActioningId(resolveTarget)
    try {
      await resolveSosAlert(resolveTarget, resolveNote.trim() || null)
      toast.success('SOS alert marked resolved')
      setResolveTarget(null)
      setResolveNote('')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to resolve')
    } finally {
      setActioningId(null)
    }
  }

  const pendingCount = events.filter((e) => e.status === 'pending').length
  const openSosCount = alerts.filter((a) => !a.resolved).length

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Security</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No-Sale drawer opens and SOS alerts — the two things that previously left zero trace.
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('drawer')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold ${tab === 'drawer' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
        >
          <DoorOpen className="h-4 w-4" /> Drawer Events {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button
          onClick={() => setTab('sos')}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold ${tab === 'sos' ? 'bg-red-600 text-white' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
        >
          <ShieldAlert className="h-4 w-4" /> SOS Alerts {openSosCount > 0 && `(${openSosCount})`}
        </button>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…</p>
      ) : tab === 'drawer' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {events.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No drawer opens logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                    {['When', 'Opened By', 'Branch', 'Reason', 'Note', 'Status', ''].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2 text-sm text-slate-500">{formatDateTime(e.created_at)}</td>
                      <td className="px-4 py-2 text-sm font-medium text-slate-900 dark:text-white">{e.opener?.name || '—'}</td>
                      <td className="px-4 py-2 text-sm text-slate-500">{e.branches?.name || '—'}</td>
                      <td className="px-4 py-2 text-sm text-slate-500">{DRAWER_REASONS[e.reason] || e.reason}</td>
                      <td className="px-4 py-2 text-sm text-slate-500">{e.note || '—'}</td>
                      <td className="px-4 py-2"><StatusBadge status={e.status} /></td>
                      <td className="px-4 py-2 text-right">
                        {e.status === 'pending' ? (
                          <>
                            <button
                              onClick={() => approveDrawer(e.id)}
                              disabled={actioningId === e.id}
                              className="mr-2 inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => { setFlagTarget(e.id); setFlagNote('') }}
                              disabled={actioningId === e.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:hover:bg-red-950/30"
                            >
                              <Flag className="h-3.5 w-3.5" /> Flag
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">by {e.reviewer?.name || '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {alerts.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No SOS alerts have ever been triggered — good.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                    {['When', 'Triggered By', 'Branch', 'Status', ''].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id} className={`border-b border-slate-100 dark:border-slate-800 ${!a.resolved ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                      <td className="px-4 py-2 text-sm text-slate-500">{formatDateTime(a.created_at)}</td>
                      <td className="px-4 py-2 text-sm font-medium text-slate-900 dark:text-white">{a.triggerer?.name || '—'}</td>
                      <td className="px-4 py-2 text-sm text-slate-500">{a.branches?.name || '—'}</td>
                      <td className="px-4 py-2">
                        {a.resolved
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700 dark:bg-green-950 dark:text-green-400"><CheckCircle2 className="h-3 w-3" /> Resolved</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950 dark:text-red-400"><ShieldAlert className="h-3 w-3" /> Open</span>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!a.resolved ? (
                          <button
                            onClick={() => { setResolveTarget(a.id); setResolveNote('') }}
                            disabled={actioningId === a.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Resolved
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">by {a.resolver?.name || '—'}{a.resolved_note ? ` — ${a.resolved_note}` : ''}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {flagTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h3 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Flag this drawer event</h3>
            <p className="mb-3 text-sm text-slate-500">The drawer already opened — this marks it for follow-up, not a reversal.</p>
            <textarea
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              placeholder="Why does this need follow-up?"
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setFlagTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                Cancel
              </button>
              <button
                onClick={submitFlagDrawer}
                disabled={actioningId === flagTarget}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                Flag
              </button>
            </div>
          </div>
        </div>
      )}

      {resolveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h3 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Resolve this SOS alert</h3>
            <p className="mb-3 text-sm text-slate-500">Confirm the situation has been checked on and handled.</p>
            <textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="What happened? (optional)"
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setResolveTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                Cancel
              </button>
              <button
                onClick={submitResolveSos}
                disabled={actioningId === resolveTarget}
                className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
              >
                Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
