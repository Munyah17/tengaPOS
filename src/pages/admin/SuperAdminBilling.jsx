import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, Briefcase, Info, Receipt } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS } from '@/pages/admin/AdminTenants'

export default function SuperAdminBilling() {
  const [tenants, setTenants] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
    ]).then(([{ data: t }, { data: p }]) => {
      setTenants(t || [])
      setPayments(p || [])
      setLoading(false)
    })
  }, [])

  // Only BYOD recurs monthly. Standard/Pro are once-off with free renewal (Ts & Cs apply).
  const mrr = tenants.reduce((sum, t) => {
    const plan = PLANS[t.plan_type]
    return plan?.recurring && plan.price ? sum + plan.price : sum
  }, 0)
  const onceOffTotal = tenants.reduce((sum, t) => {
    const plan = PLANS[t.plan_type]
    return plan && !plan.recurring && plan.price ? sum + plan.price : sum
  }, 0)
  const collectedTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const customQuote = tenants.filter((t) => t.plan_type && !PLANS[t.plan_type]?.price)

  const byPlan = Object.entries(PLANS)
    .map(([key, plan]) => {
      const count = tenants.filter((t) => t.plan_type === key).length
      return { key, plan, count }
    })
    .filter((row) => row.count > 0)

  if (loading) {
    return <div className="p-6">Loading…</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Billing & Revenue</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Live revenue from active subscriptions and recorded payments
        </p>
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
            {byPlan.map(({ key, plan, count }) => {
              const Icon = plan.icon
              return (
                <div key={key} className="flex items-center gap-4 rounded-xl border border-slate-100 px-4 py-3 dark:border-white/5">
                  <Icon className={`h-5 w-5 flex-shrink-0 ${plan.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{plan.label}</p>
                    <p className="text-xs text-slate-500">
                      {count} tenant{count !== 1 ? 's' : ''} · {plan.priceLabel}
                      {plan.renewalNote && <span className="ml-1 text-green-500">· {plan.renewalNote}</span>}
                    </p>
                  </div>
                  <p className="flex-shrink-0 text-sm font-bold text-slate-900 dark:text-white">
                    {plan.price === null
                      ? 'Custom'
                      : plan.recurring
                        ? `$${(plan.price * count).toFixed(2)}/mo`
                        : `$${(plan.price * count).toFixed(2)} once-off`}
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
    </div>
  )
}
