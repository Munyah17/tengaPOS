import { useState, useEffect } from 'react'
import { CheckCircle2, Flag, Loader2, ShieldAlert, Clock } from 'lucide-react'
import { formatCurrency, formatDateTime } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
// Not reachable from /demo -- imported straight from db.js, same
// reasoning as StockTake.jsx/CashUp.jsx/RefundAudit.jsx.
import { fetchPendingDiscountReviews, fetchDiscountReviewHistory, reviewDiscount } from '@/lib/db'
import toast from 'react-hot-toast'

// Every <=10% discount lands here needing a first-time sign-off (>10%
// discounts were already pre-approved by a manager at checkout -- see
// process_checkout / 1786180000 -- so they never show up in this queue).
// "Approve" just records the sign-off; "Flag" is the closest thing to a
// rejection a completed sale can get -- there's nothing left to undo, so
// it marks the order for follow-up outside the system instead.
export default function DiscountReviews() {
  const { tenant } = useAuthStore()
  const [pending, setPending] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState(null)
  const [flagTarget, setFlagTarget] = useState(null)
  const [flagNote, setFlagNote] = useState('')

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    Promise.all([fetchPendingDiscountReviews(tenant.id), fetchDiscountReviewHistory(tenant.id)])
      .then(([p, h]) => { setPending(p); setHistory(h) })
      .catch(() => toast.error('Failed to load discount reviews'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const approve = async (orderId) => {
    setActioningId(orderId)
    try {
      await reviewDiscount(orderId, 'approve', null)
      toast.success('Discount approved')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to approve')
    } finally {
      setActioningId(null)
    }
  }

  const submitFlag = async () => {
    if (!flagNote.trim()) { toast.error('A note is required to flag a discount'); return }
    setActioningId(flagTarget)
    try {
      await reviewDiscount(flagTarget, 'flag', flagNote.trim())
      toast.success('Discount flagged for follow-up')
      setFlagTarget(null)
      setFlagNote('')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to flag')
    } finally {
      setActioningId(null)
    }
  }

  const Row = ({ r, showReview }) => {
    const o = r.order
    const pct = o?.subtotal > 0 ? (o.discount_amount / o.subtotal) * 100 : 0
    return (
      <tr className="border-b border-slate-100 dark:border-slate-800">
        <td className="px-4 py-2 text-sm font-medium text-slate-900 dark:text-white">{o?.order_no || '—'}</td>
        <td className="px-4 py-2 text-sm text-slate-500">{o?.users?.name || '—'}</td>
        <td className="px-4 py-2 text-sm text-slate-500">{o?.branches?.name || '—'}</td>
        <td className="px-4 py-2 text-sm text-slate-500">{o?.created_at ? formatDateTime(o.created_at) : '—'}</td>
        <td className="px-4 py-2 text-sm text-slate-500">{formatCurrency(o?.discount_amount || 0, tenant?.currency)} ({pct.toFixed(1)}%)</td>
        <td className="px-4 py-2 text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(o?.total || 0, tenant?.currency)}</td>
        {showReview ? (
          <td className="px-4 py-2 text-right">
            <button
              onClick={() => approve(r.order_id)}
              disabled={actioningId === r.order_id}
              className="mr-2 inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </button>
            <button
              onClick={() => { setFlagTarget(r.order_id); setFlagNote('') }}
              disabled={actioningId === r.order_id}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              <Flag className="h-3.5 w-3.5" /> Flag
            </button>
          </td>
        ) : (
          <td className="px-4 py-2 text-right text-xs">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-bold ${r.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'}`}>
              {r.status === 'approved' ? <CheckCircle2 className="h-3 w-3" /> : <Flag className="h-3 w-3" />}
              {r.status}
            </span>
            <div className="mt-1 text-slate-400">by {r.reviewer?.name || '—'}</div>
          </td>
        )}
      </tr>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Discount Reviews</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Every discount needs a Vendor or Shop Manager's sign-off. Over-10% discounts are pre-approved at checkout;
          everything <b>≤10%</b> lands here for a first-time review.
        </p>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" /> Loading…</p>
      ) : (
        <>
          <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                <Clock className="h-4 w-4" /> Awaiting Review {pending.length > 0 && `(${pending.length})`}
              </h2>
            </div>
            {pending.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">Nothing waiting — every discount so far has been reviewed.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                      {['Order', 'Cashier', 'Branch', 'Date', 'Discount', 'Total', ''].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((r) => <Row key={r.order_id} r={r} showReview />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                <ShieldAlert className="h-4 w-4" /> Recently Reviewed
              </h2>
            </div>
            {history.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No history yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                      {['Order', 'Cashier', 'Branch', 'Date', 'Discount', 'Total', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => <Row key={r.order_id} r={r} showReview={false} />)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {flagTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-slate-900">
            <h3 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Flag this discount</h3>
            <p className="mb-3 text-sm text-slate-500">The sale already happened — this marks it for follow-up (a conversation, a write-up), not a reversal.</p>
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
                onClick={submitFlag}
                disabled={actioningId === flagTarget}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                Flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
