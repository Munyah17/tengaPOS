import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle,
  Info, ChevronDown, ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, formatDateTime } from '@/utils/formatters'
import { fetchPaymentSessions, approvePaymentSession, declinePaymentSession } from '@/lib/db'

const STATUS_CONFIG = {
  pending:            { label: 'Pending',    icon: Clock,        bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-300' },
  paid:               { label: 'Paid',       icon: CheckCircle,  bg: 'bg-green-100 dark:bg-green-900/40',  text: 'text-green-700 dark:text-green-300' },
  awaiting_delivery:  { label: 'Awaiting',   icon: Clock,        bg: 'bg-blue-100 dark:bg-blue-900/40',    text: 'text-blue-700 dark:text-blue-300' },
  cancelled:          { label: 'Cancelled',  icon: XCircle,      bg: 'bg-red-100 dark:bg-red-900/40',      text: 'text-red-700 dark:text-red-300' },
  failed:             { label: 'Failed',     icon: XCircle,      bg: 'bg-red-100 dark:bg-red-900/40',      text: 'text-red-700 dark:text-red-300' },
}

const FILTER_TABS = [
  { key: 'all',     label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid',    label: 'Paid' },
  { key: 'cancelled', label: 'Declined' },
]

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

function ItemsPreview({ items }) {
  const [open, setOpen] = useState(false)
  if (!items?.length) return <span className="text-slate-400">—</span>
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-brand-600 hover:underline dark:text-brand-400"
      >
        {items.length} item{items.length !== 1 ? 's' : ''}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 space-y-0.5 overflow-hidden text-xs text-slate-600 dark:text-slate-400"
          >
            {items.map((i, idx) => (
              <li key={idx}>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''} — ${parseFloat(i.price).toFixed(2)}</li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function ConfirmModal({ session, action, onConfirm, onCancel }) {
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const isApprove = action === 'approve'

  const handleConfirm = async () => {
    setLoading(true)
    await onConfirm(session, note)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-3">
          <div className={`rounded-xl p-2 ${isApprove ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
            {isApprove
              ? <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              : <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />}
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">
              {isApprove ? 'Approve Payment' : 'Decline Payment'}
            </h3>
            <p className="text-xs text-slate-500">{session.reference}</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">Amount</span>
            <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(session.amount)}</span>
          </div>
          {session.paynow_reference && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Paynow Ref</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{session.paynow_reference}</span>
            </div>
          )}
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
            Note <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={isApprove ? 'e.g. Confirmed via EcoCash SMS' : 'e.g. Customer cancelled order'}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
              isApprove ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {loading ? 'Saving…' : isApprove ? 'Confirm Approved' : 'Confirm Declined'}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Payments() {
  const { tenant, user } = useAuthStore()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null) // { session, action }

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchPaymentSessions(tenant.id)
      .then(setSessions)
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tenant?.id])

  const pendingCount = sessions.filter(s => s.status === 'pending').length

  const filtered = sessions.filter(s => {
    if (filter === 'all') return true
    return s.status === filter
  })

  const handleConfirm = async (session, note) => {
    try {
      if (modal.action === 'approve') {
        await approvePaymentSession(session.id, user?.id, note)
        toast.success('Payment approved — transaction recorded')
      } else {
        await declinePaymentSession(session.id, user?.id, note)
        toast.success('Payment declined')
      }
      setSessions(prev => prev.map(s => s.id === session.id
        ? { ...s, status: modal.action === 'approve' ? 'paid' : 'cancelled', manually_confirmed: true }
        : s
      ))
      setModal(null)
    } catch (err) {
      toast.error(err.message || 'Operation failed')
    }
  }

  return (
    <div className="p-6">
      {modal && (
        <ConfirmModal
          session={modal.session}
          action={modal.action}
          onConfirm={handleConfirm}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Payments</h1>
          <p className="text-sm text-slate-500">Manual confirmation for Paynow sessions</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Info banner */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-semibold">Manual payment confirmation</p>
          <p className="mt-1">
            Payments from your Paynow integration appear here. If a payment is not automatically confirmed, review it below and approve or decline manually. Ensure your Paynow integration keys are saved in <strong>Settings → Payment Gateway</strong>.
          </p>
        </div>
      </div>

      {/* Pending alert */}
      {pendingCount > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {pendingCount} payment{pendingCount !== 1 ? 's' : ''} waiting for confirmation
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900 sm:w-fit">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
              filter === tab.key
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            {tab.label}
            {tab.key === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs text-white">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                {['Reference', 'Date', 'Amount', 'Items', 'Paynow Ref', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <CreditCard className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-400">No payment sessions found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(s => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">{s.reference}</span>
                      {s.manually_confirmed && (
                        <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">manual</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(s.created_at)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(s.amount)}</td>
                    <td className="px-4 py-3">
                      <ItemsPreview items={s.order_data?.items} />
                    </td>
                    <td className="px-4 py-3">
                      {s.paynow_reference ? (
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">{s.paynow_reference}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3">
                      {s.status === 'pending' || s.status === 'awaiting_delivery' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setModal({ session: s, action: 'approve' })}
                            className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => setModal({ session: s, action: 'decline' })}
                            className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
