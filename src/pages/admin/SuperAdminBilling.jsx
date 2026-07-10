import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, Briefcase, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS } from '@/pages/admin/AdminTenants'

export default function SuperAdminBilling() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('tenants')
      .select('id, name, status, plan_type, plan_start_date, next_renewal_date')
      .eq('status', 'active')
      .then(({ data }) => {
        setTenants(data || [])
        setLoading(false)
      })
  }, [])

  const priced = tenants.filter((t) => PLANS[t.plan_type]?.price)
  const customQuote = tenants.filter((t) => t.plan_type && !PLANS[t.plan_type]?.price)

  const mrr = priced.reduce((sum, t) => {
    const plan = PLANS[t.plan_type]
    return sum + plan.price / plan.renewalMonths
  }, 0)
  const annualised = mrr * 12

  const byPlan = Object.entries(PLANS)
    .map(([key, plan]) => {
      const count = tenants.filter((t) => t.plan_type === key).length
      const revenue = plan.price ? (plan.price / plan.renewalMonths) * count : null
      return { key, plan, count, revenue }
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
          Recurring revenue from active subscriptions, at published plan pricing
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-2 text-sm text-slate-500"><DollarSign className="h-4 w-4" /> Monthly Recurring</div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">${mrr.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-2 text-sm text-slate-500"><TrendingUp className="h-4 w-4" /> Annualised</div>
          <p className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">${annualised.toFixed(2)}</p>
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
            {byPlan.map(({ key, plan, count, revenue }) => {
              const Icon = plan.icon
              return (
                <div key={key} className="flex items-center gap-4 rounded-xl border border-slate-100 px-4 py-3 dark:border-white/5">
                  <Icon className={`h-5 w-5 ${plan.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{plan.label}</p>
                    <p className="text-xs text-slate-500">{count} tenant{count !== 1 ? 's' : ''} · {plan.priceLabel}</p>
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {revenue === null ? 'Custom' : `$${revenue.toFixed(2)}/mo`}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-900/20">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-blue-800 dark:text-blue-300">
          Figures are computed from live tenant data at published plan pricing. Actual collected
          payments will appear here once subscription payments are recorded (e.g. via Paynow).
        </p>
      </div>
    </div>
  )
}
