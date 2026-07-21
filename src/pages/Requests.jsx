/**
 * Vendor Requests — every approval waiting on the business owner, in one
 * place: receipt-config changes from shop managers, void/return requests
 * and validations, and Paynow payments needing manual review. Previously
 * these were scattered (or invisible) across Settings, Transactions, and
 * Payments, so requests silently piled up unseen.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Inbox, Printer, Ban, Undo2, CreditCard, CheckCircle, XCircle,
  ShieldCheck, ChevronRight, RefreshCw, ClipboardEdit,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import {
  fetchVendorRequests, approveReceiptConfig, rejectReceiptConfig,
  approveVoid, validateVoid, rejectVoid,
  approveReturn, validateReturn, rejectReturn,
  approveConfigChange, rejectConfigChange,
} from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import { formatCurrency } from '@/utils/formatters'
import toast from 'react-hot-toast'

const TEMPLATE_LABELS = {
  zimra_default: 'ZIMRA Default Receipt',
  zimra_customized: 'ZIMRA + Customisation',
  fully_customized: 'Fully Customized Receipt',
}

const CONFIG_AREA_LABEL = { general: 'General Settings', receipts_config: 'Receipts Config' }
const CONFIG_FIELD_LABEL = {
  name: 'Business Name', currency: 'Currency', template_mode: 'Template', store_name: 'Store Name',
  store_address: 'Store Address', store_contacts: 'Store Contacts', tin: 'TIN', vat_number: 'VAT Reg No.',
  footer_message: 'Footer Message', header_message: 'Header Message', paper_width_mm: 'Paper Size',
  printer_connection: 'Printer Connection', show_pos_print: 'POS Printer Button',
}

// Only the fields that actually changed, old → new — so the Vendor can see
// what's different at a glance instead of a full dump of every field.
function diffValues(oldValues, newValues) {
  const keys = [...new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})])]
  return keys
    .filter((k) => CONFIG_FIELD_LABEL[k] && JSON.stringify(oldValues?.[k]) !== JSON.stringify(newValues?.[k]))
    .map((k) => ({ label: CONFIG_FIELD_LABEL[k], from: oldValues?.[k], to: newValues?.[k] }))
}

function Section({ icon: Icon, title, count, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <Icon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        <h2 className="font-bold text-slate-900 dark:text-white">{title}</h2>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${
          count > 0
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}>
          {count}
        </span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {count === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400">Nothing waiting</p>
        ) : children}
      </div>
    </div>
  )
}

function ActionButton({ onClick, tone, children }) {
  const tones = {
    approve: 'bg-green-600 text-white hover:bg-green-700',
    validate: 'bg-brand-600 text-white hover:bg-brand-700',
    reject: 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
  }
  return (
    <button onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${tones[tone]}`}>
      {children}
    </button>
  )
}

export default function Requests() {
  const { tenant } = useAuthStore()
  const [requests, setRequests] = useState({ receiptConfigs: [], voids: [], returns: [], payments: [], configChanges: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(() => {
    if (!tenant?.id) return
    return loadWithOfflineCache(
      ['vendorRequests', tenant.id],
      () => fetchVendorRequests(tenant.id),
      { onData: setRequests, onLoadingChange: setLoading },
    )
  }, [tenant?.id])

  useEffect(() => {
    load()
    window.addEventListener('tengapos:force-refresh', load)
    return () => window.removeEventListener('tengapos:force-refresh', load)
  }, [load])

  const refresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  // Wraps an action so the list always reloads after it, success or error
  const act = (fn, successMsg) => async (...args) => {
    try {
      await fn(...args)
      toast.success(successMsg)
    } catch (err) {
      toast.error(err.message || 'Action failed')
    }
    load()
  }

  const rejectWithReason = (fn, successMsg) => (id) => {
    const reason = window.prompt('Reason for rejecting (optional):') // eslint-disable-line no-alert
    if (reason === null) return
    act(fn, successMsg)(id, reason)
  }

  const fmt = (n) => formatCurrency(n, tenant?.currency)
  const when = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Requests</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Approvals waiting on you — {requests.total} pending
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      ) : (
        <div className="space-y-5">
          {/* Shop Manager config changes — applied immediately, revert automatically if not approved within 48h */}
          <Section icon={ClipboardEdit} title="Config Changes" count={requests.configChanges.length}>
            {requests.configChanges.map((c) => {
              const diff = diffValues(c.old_values, c.new_values)
              const hoursLeft = Math.max(0, Math.round((new Date(c.expires_at) - Date.now()) / 3600000))
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {CONFIG_AREA_LABEL[c.config_area] || c.config_area} · by {c.submitter?.name || 'Unknown'}
                    </p>
                    {diff.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {diff.map((d) => (
                          <p key={d.label} className="text-xs text-slate-500">
                            {d.label}: <span className="line-through">{String(d.from ?? '—')}</span> → <span className="font-medium text-slate-700 dark:text-slate-300">{String(d.to ?? '—')}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    <p className="mt-0.5 text-xs text-amber-500">
                      Already live — reverts automatically in {hoursLeft}h if not approved · submitted {when(c.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <ActionButton tone="approve" onClick={() => act(approveConfigChange, 'Approved')(c.id)}>Approve</ActionButton>
                    <ActionButton tone="reject" onClick={() => act(rejectConfigChange, 'Rejected — reverted')(c.id)}>Reject</ActionButton>
                  </div>
                </div>
              )
            })}
          </Section>

          {/* Receipt config changes */}
          <Section icon={Printer} title="Receipt Config Changes" count={requests.receiptConfigs.length}>
            {requests.receiptConfigs.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {c.branches?.name || 'Tenant-wide default'} — {TEMPLATE_LABELS[c.template_mode] || c.template_mode}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[c.store_name, c.store_address].filter(Boolean).join(' · ') || 'No store details set'}
                    {c.updated_at && ` · submitted ${when(c.updated_at)}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    The branch keeps printing its current approved config until you approve this change.
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <ActionButton tone="approve" onClick={() => act(approveReceiptConfig, 'Receipt config approved — now live')(c.id)}>Approve</ActionButton>
                  <ActionButton tone="reject" onClick={() => act(rejectReceiptConfig, 'Change rejected')(c.id)}>Reject</ActionButton>
                </div>
              </div>
            ))}
          </Section>

          {/* Voids */}
          <Section icon={Ban} title="Void Requests" count={requests.voids.length}>
            {requests.voids.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Order {v.orders?.order_no || '—'}
                    {v.amount != null && <span className="ml-2 text-red-500">{fmt(v.amount)}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {v.reason || 'No reason given'} · by {v.requester?.name || 'Unknown'} · {when(v.created_at)}
                    {v.status === 'approved' && ' · approved, awaiting your validation'}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  {v.status === 'requested' && (
                    <ActionButton tone="approve" onClick={() => act(approveVoid, 'Void approved')(v.id)}>Approve</ActionButton>
                  )}
                  {v.status === 'approved' && (
                    <ActionButton tone="validate" onClick={() => act(validateVoid, 'Void validated — stock restored')(v.id)}>Validate</ActionButton>
                  )}
                  <ActionButton tone="reject" onClick={() => rejectWithReason(rejectVoid, 'Void rejected')(v.id)}>Reject</ActionButton>
                </div>
              </div>
            ))}
          </Section>

          {/* Returns */}
          <Section icon={Undo2} title="Return / Refund Requests" count={requests.returns.length}>
            {requests.returns.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Order {r.orders?.order_no || '—'}
                    {r.amount != null && <span className="ml-2 text-purple-500">{fmt(r.amount)}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.reason || 'No reason given'} · by {r.requester?.name || 'Unknown'} · {when(r.created_at)}
                    {r.status === 'approved' && ' · approved, awaiting your validation'}
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  {r.status === 'requested' && (
                    <ActionButton tone="approve" onClick={() => act(approveReturn, 'Return approved')(r.id)}>Approve</ActionButton>
                  )}
                  {r.status === 'approved' && (
                    <ActionButton tone="validate" onClick={() => act(validateReturn, 'Return validated — stock restored, refund recorded')(r.id)}>Validate</ActionButton>
                  )}
                  <ActionButton tone="reject" onClick={() => rejectWithReason(rejectReturn, 'Return rejected')(r.id)}>Reject</ActionButton>
                </div>
              </div>
            ))}
          </Section>

          {/* Payments needing manual review — approval needs a confirmation
              note, so it stays on the Payments page with its modal */}
          <Section icon={CreditCard} title="Payments Awaiting Review" count={requests.payments.length}>
            {requests.payments.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {fmt(s.amount)} · {s.method || 'Paynow'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {s.reference || s.paynow_reference || 'No reference'} · {when(s.created_at)}
                  </p>
                </div>
                <Link
                  to="/app/payments"
                  className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  Review <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </Section>

          {requests.total === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
              <Inbox className="h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">All caught up — nothing needs your approval</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
