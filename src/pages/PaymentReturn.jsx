import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Clock, RefreshCw, ArrowLeft, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const STATUS_UI = {
  paid: {
    icon: CheckCircle,
    color: 'text-green-500',
    ring: 'ring-green-100 dark:ring-green-900/40',
    title: 'Payment Successful',
    sub: 'The transaction was confirmed by Paynow. Money goes directly to the merchant Paynow account.',
    badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  },
  awaiting_delivery: {
    icon: Clock,
    color: 'text-amber-500',
    ring: 'ring-amber-100 dark:ring-amber-900/40',
    title: 'Payment Received',
    sub: 'Paynow received the payment. Awaiting delivery confirmation.',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    ring: 'ring-red-100 dark:ring-red-900/40',
    title: 'Payment Failed',
    sub: 'The transaction was not completed. Please try again.',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  },
  cancelled: {
    icon: XCircle,
    color: 'text-slate-400',
    ring: 'ring-slate-100 dark:ring-slate-800',
    title: 'Payment Cancelled',
    sub: 'The customer cancelled the Paynow transaction.',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
  pending: {
    icon: Clock,
    color: 'text-brand-500',
    ring: 'ring-brand-100 dark:ring-brand-900/40',
    title: 'Checking Payment…',
    sub: 'Waiting for Paynow confirmation. This takes a few seconds.',
    badge: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400',
  },
}

const MAX_POLLS = 15
const POLL_INTERVAL = 2000

export default function PaymentReturn() {
  const [searchParams] = useSearchParams()
  const reference = searchParams.get('reference')

  const [status, setStatus] = useState('pending')
  const [session, setSession] = useState(null)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!reference) { setStatus('failed'); return }

    let count = 0
    let timer

    const poll = async () => {
      try {
        const { data } = await supabase
          .from('payment_sessions')
          .select('reference, paynow_reference, amount, status, order_data, created_at')
          .eq('reference', reference)
          .single()

        if (data) {
          setSession(data)
          setStatus(data.status)
          if (data.status !== 'pending') return // done
        }
      } catch { /* retry */ }

      count++
      if (count < MAX_POLLS) {
        timer = setTimeout(poll, POLL_INTERVAL)
      } else {
        // The passive loop above only ever sees what Paynow's webhook has
        // already written to payment_sessions -- if that webhook was ever
        // dropped in transit, this row would sit on "pending" forever with
        // nothing to reconcile it, even though Paynow already knows the
        // real outcome. One direct check via Paynow's own pollUrl before
        // giving up closes that gap.
        try {
          const { data: pollResult } = await supabase.functions.invoke('paynow-poll-status', { body: { reference } })
          if (pollResult?.status && pollResult.status !== 'pending') {
            setStatus(pollResult.status)
            setSession((s) => (s ? { ...s, status: pollResult.status } : s))
            return
          }
        } catch { /* fall through -- still show the timed-out state below */ }
        setTimedOut(true)
      }
    }

    poll()
    return () => clearTimeout(timer)
  }, [reference])

  const ui = STATUS_UI[status] || STATUS_UI.pending
  const Icon = ui.icon
  const isSpinning = status === 'pending' && !timedOut

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-900">
      <div className="w-full max-w-sm">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
          {/* Status icon */}
          <div className={`flex justify-center py-10 ring-8 ${ui.ring}`}>
            {isSpinning ? (
              <RefreshCw className={`h-20 w-20 animate-spin ${ui.color}`} />
            ) : (
              <Icon className={`h-20 w-20 ${ui.color}`} />
            )}
          </div>

          <div className="p-6">
            <h1 className="mb-1 text-center text-xl font-extrabold text-slate-900 dark:text-white">
              {timedOut && status === 'pending' ? 'Payment Not Confirmed' : ui.title}
            </h1>
            <p className="mb-5 text-center text-sm text-slate-500">
              {timedOut && status === 'pending'
                ? 'No confirmation within 30 seconds — treat this as failed for now. If money left your account, it will reflect once Paynow confirms; check Transactions shortly.'
                : ui.sub}
            </p>

            {/* Session details */}
            {session && (
              <div className="mb-5 space-y-2.5 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Status</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${ui.badge}`}>
                    {session.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    ${Number(session.amount).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Reference</span>
                  <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                    {session.reference}
                  </span>
                </div>
                {session.paynow_reference && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Paynow Ref</span>
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                      {session.paynow_reference}
                    </span>
                  </div>
                )}
              </div>
            )}

            {!reference && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                No payment reference in URL. This page should only be visited after a Paynow checkout.
              </div>
            )}

            <div className="flex gap-3">
              <Link
                to="/app/pos"
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-bold text-white hover:bg-brand-700"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to POS
              </Link>
              {(status === 'paid' || status === 'awaiting_delivery') && (
                <Link
                  to="/app/transactions"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  <Receipt className="h-4 w-4" />
                  Transactions
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
