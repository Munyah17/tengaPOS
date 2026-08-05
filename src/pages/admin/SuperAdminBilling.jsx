import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, Briefcase, Info, Receipt, Plus, X, Loader2, RefreshCw, Bell, Check, RotateCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS } from '@/pages/admin/AdminTenants'
import { usePlanPricing, priceLabelFor } from '@/lib/platformSettings'
import { formatCurrency, formatDate, toLocalDateStr, stripLeadingZero } from '@/utils/formatters'
import toast from 'react-hot-toast'

const INVOICE_STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
}
const RECURRENCE_MONTHS = { monthly: 1, quarterly: 3, halfyear: 6, yearly: 12 }

function CreateInvoiceModal({ tenants, onClose, onCreated }) {
  const [form, setForm] = useState({ tenant_id: '', description: '', amount: '', currency: 'USD', due_date: '', is_recurring: false, recurrence_interval: 'monthly' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.tenant_id) { toast.error('Choose a tenant'); return }
    const amount = Number(form.amount)
    if (!amount || amount <= 0) { toast.error('Enter an amount greater than zero'); return }
    setSaving(true)
    try {
      const nextDate = new Date()
      nextDate.setMonth(nextDate.getMonth() + (RECURRENCE_MONTHS[form.recurrence_interval] || 1))
      const { error } = await supabase.from('platform_invoices').insert({
        tenant_id: form.tenant_id,
        description: form.description.trim(),
        amount,
        currency: form.currency,
        status: 'sent',
        sent_at: new Date().toISOString(),
        due_date: form.due_date || null,
        is_recurring: form.is_recurring,
        recurrence_interval: form.is_recurring ? form.recurrence_interval : null,
        next_invoice_date: form.is_recurring ? toLocalDateStr(nextDate) : null,
      })
      if (error) throw error
      toast.success('Invoice sent')
      onCreated()
    } catch (err) {
      toast.error(err.message || 'Failed to create invoice')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-white">Create Invoice</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Tenant</label>
            <select value={form.tenant_id} onChange={(e) => set('tenant_id', e.target.value)} required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white">
              <option value="">— Select tenant —</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Description</label>
            <input value={form.description} onChange={(e) => set('description', e.target.value)} required placeholder="e.g. BYOD Monthly Fee — August 2026" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Amount</label>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => set('amount', stripLeadingZero(e.target.value))} required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={form.is_recurring} onChange={(e) => set('is_recurring', e.target.checked)} className="h-4 w-4 rounded" />
            Recurring
          </label>
          {form.is_recurring && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Interval</label>
              <select value={form.recurrence_interval} onChange={(e) => set('recurrence_interval', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="halfyear">Every 6 months</option>
                <option value="yearly">Yearly</option>
              </select>
              <p className="mt-1 text-[11px] text-slate-400">No auto-charging yet — use "Generate Next Invoice" on the row when the next one is due.</p>
            </div>
          )}
        </div>
        <button type="submit" disabled={saving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Sending…' : 'Send Invoice'}
        </button>
      </form>
    </div>
  )
}

export default function SuperAdminBilling() {
  const [tenants, setTenants] = useState([])
  const [payments, setPayments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const { pricing } = usePlanPricing()

  const load = () => {
    Promise.all([
      supabase
        .from('tenants')
        .select('id, name, status, plan_type, plan_start_date, next_renewal_date')
        .eq('status', 'active'),
      supabase
        .from('subscription_payments')
        .select('*, tenants(name)')
        .order('paid_at', { ascending: false })
        .limit(50),
      supabase
        .from('platform_invoices')
        .select('*, tenants(name)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('admin_notifications')
        .select('*')
        .eq('type', 'payment_due')
        .eq('is_read', false)
        .order('created_at', { ascending: false }),
    ]).then(([{ data: t }, { data: p }, { data: inv }, { data: c }]) => {
      setTenants(t || [])
      setPayments(p || [])
      setInvoices(inv || [])
      setClaims(c || [])
      setLoading(false)
    })
  }
  useEffect(load, [])

  const markCashReceived = async (invoiceId) => {
    setBusyId(invoiceId)
    try {
      const { error } = await supabase.rpc('confirm_platform_invoice_cash_payment', { p_invoice_id: invoiceId })
      if (error) throw error
      toast.success('Marked as paid')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to confirm payment')
    } finally {
      setBusyId(null)
    }
  }

  const generateNext = async (inv) => {
    setBusyId(inv.id)
    try {
      const nextDate = new Date()
      nextDate.setMonth(nextDate.getMonth() + (RECURRENCE_MONTHS[inv.recurrence_interval] || 1))
      const { error } = await supabase.from('platform_invoices').insert({
        tenant_id: inv.tenant_id,
        description: inv.description,
        amount: inv.amount,
        currency: inv.currency,
        status: 'sent',
        sent_at: new Date().toISOString(),
        is_recurring: true,
        recurrence_interval: inv.recurrence_interval,
        next_invoice_date: toLocalDateStr(nextDate),
        parent_invoice_id: inv.parent_invoice_id || inv.id,
      })
      if (error) throw error
      toast.success('Next invoice generated')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to generate next invoice')
    } finally {
      setBusyId(null)
    }
  }

  const dismissClaim = async (claimId) => {
    await supabase.from('admin_notifications').update({ is_read: true }).eq('id', claimId)
    setClaims((prev) => prev.filter((c) => c.id !== claimId))
  }

  // Live price for a plan key -- platform_settings.plan_pricing overrides
  // PLANS' hardcoded defaults, and Super Admin's Pricing Tiers page promises
  // "revenue reports update instantly" when they change a price, so this
  // must never read PLANS[key].price directly.
  const priceOf = (key) => pricing[key]?.price ?? PLANS[key]?.price
  const isRecurring = (key) => pricing[key]?.recurring ?? PLANS[key]?.recurring

  // Only BYOD recurs monthly. Standard/Pro are once-off with free renewal (Ts & Cs apply).
  const mrr = tenants.reduce((sum, t) => {
    const price = priceOf(t.plan_type)
    return isRecurring(t.plan_type) && price ? sum + price : sum
  }, 0)
  const onceOffTotal = tenants.reduce((sum, t) => {
    const price = priceOf(t.plan_type)
    return PLANS[t.plan_type] && !isRecurring(t.plan_type) && price ? sum + price : sum
  }, 0)
  const collectedTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const customQuote = tenants.filter((t) => t.plan_type && !priceOf(t.plan_type))

  const byPlan = Object.entries(PLANS)
    .map(([key, plan]) => {
      const count = tenants.filter((t) => t.plan_type === key).length
      return { key, plan, count, price: priceOf(key), recurring: isRecurring(key) }
    })
    .filter((row) => row.count > 0)

  if (loading) {
    return <div className="p-6">Loading…</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Billing & Revenue</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Live revenue from active subscriptions and recorded payments
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Create Invoice
          </button>
        </div>
      </div>

      {claims.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-300">
            <Bell className="h-4 w-4" /> Pending Payment Claims
          </div>
          <div className="space-y-2">
            {claims.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-amber-200/60 bg-white px-3 py-2 dark:border-amber-800/40 dark:bg-slate-900">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</p>
                  <p className="text-xs text-slate-500">{c.body}</p>
                </div>
                <button onClick={() => dismissClaim(c.id)} className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" title="Dismiss">
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platform invoices */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No invoices yet — create one to charge a tenant.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-white/5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{inv.tenants?.name || 'Unknown tenant'}</p>
                  <p className="text-xs text-slate-500">
                    {inv.description} {inv.due_date && `· due ${formatDate(inv.due_date)}`} {inv.is_recurring && '· recurring'}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${INVOICE_STATUS_COLORS[inv.status] || INVOICE_STATUS_COLORS.draft}`}>{inv.status}</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(inv.amount, inv.currency)}</span>
                {['sent', 'overdue'].includes(inv.status) && (
                  <button
                    onClick={() => markCashReceived(inv.id)}
                    disabled={busyId === inv.id}
                    className="flex items-center gap-1 rounded-lg bg-green-600/10 px-2.5 py-1.5 text-xs font-semibold text-green-600 hover:bg-green-600/20 disabled:opacity-60 dark:text-green-400"
                  >
                    {busyId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Mark Cash Received
                  </button>
                )}
                {inv.is_recurring && inv.status === 'paid' && (
                  <button
                    onClick={() => generateNext(inv)}
                    disabled={busyId === inv.id}
                    className="flex items-center gap-1 rounded-lg bg-indigo-600/10 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-600/20 disabled:opacity-60 dark:text-indigo-400"
                  >
                    {busyId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Generate Next Invoice
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-2 text-sm text-slate-500"><TrendingUp className="h-4 w-4" /> Monthly Recurring</div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">${mrr.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-400">BYOD Monthly subscriptions</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-2 text-sm text-slate-500"><DollarSign className="h-4 w-4" /> Once-Off Plan Value</div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">${onceOffTotal.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-400">Standard & Pro — free renewal, Ts & Cs apply</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Receipt className="h-4 w-4" /> Payments Collected</div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">${collectedTotal.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-400">Via Stripe & Paynow checkout</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Briefcase className="h-4 w-4" /> Custom-Quote Accounts</div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">{customQuote.length}</p>
          <p className="mt-1 text-xs text-slate-400">Business / Enterprise — billed separately</p>
        </div>
      </div>

      {/* Revenue by plan */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Revenue by Plan</h2>
        {byPlan.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No active subscriptions yet. Revenue appears here once tenants are approved onto plans.
          </p>
        ) : (
          <div className="space-y-3">
            {byPlan.map(({ key, plan, count, price, recurring }) => {
              const Icon = plan.icon
              return (
                <div key={key} className="flex items-center gap-4 rounded-xl border border-slate-100 px-4 py-3 dark:border-white/5">
                  <Icon className={`h-5 w-5 flex-shrink-0 ${plan.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{plan.label}</p>
                    <p className="text-xs text-slate-500">
                      {count} tenant{count !== 1 ? 's' : ''} · {priceLabelFor(key, { price, recurring, renewalMonths: plan.renewalMonths })}
                      {plan.renewalNote && <span className="ml-1 text-green-500">· {plan.renewalNote}</span>}
                    </p>
                  </div>
                  <p className="flex-shrink-0 text-sm font-bold text-slate-900 dark:text-white">
                    {price == null
                      ? 'Custom'
                      : recurring
                        ? `$${(price * count).toFixed(2)}/mo`
                        : `$${(price * count).toFixed(2)} once-off`}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recorded payments */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Payment History</h2>
        {payments.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No checkout payments recorded yet. Stripe and Paynow payments appear here automatically via webhooks.
          </p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 px-4 py-3 dark:border-white/5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.tenants?.name || 'Unknown tenant'}</p>
                  <p className="text-xs text-slate-500">
                    {PLANS[p.plan_type]?.label || p.plan_type} · via {p.provider}
                  </p>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(p.paid_at).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">
                  +${Number(p.amount).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-blue-800 dark:text-blue-300">
          Only BYOD Monthly is recurring revenue. Standard and Pro are once-off hardware-bundle
          payments with 6 months of use included and free renewal thereafter (Ts &amp; Cs apply).
        </p>
      </div>

      {showCreate && (
        <CreateInvoiceModal
          tenants={tenants}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}
