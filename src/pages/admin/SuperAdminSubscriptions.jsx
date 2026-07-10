import { useEffect, useState } from 'react'
import { DollarSign, Calendar, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS } from '@/pages/admin/AdminTenants'

export default function SuperAdminSubscriptions() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [planFilter, setPlanFilter] = useState('all')

  useEffect(() => {
    supabase
      .from('tenants')
      .select('id, name, slug, status, plan_type, plan_start_date, next_renewal_date')
      .eq('status', 'active')
      .order('next_renewal_date', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        setTenants(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = planFilter === 'all' ? tenants : tenants.filter((t) => t.plan_type === planFilter)
  const dueSoon = tenants.filter((t) => {
    if (!t.next_renewal_date) return false
    const days = (new Date(t.next_renewal_date) - Date.now()) / 86400000
    return days >= 0 && days <= 30
  })

  const planCounts = Object.keys(PLANS).reduce((acc, key) => {
    acc[key] = tenants.filter((t) => t.plan_type === key).length
    return acc
  }, {})

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Subscriptions</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {tenants.length} active subscription{tenants.length !== 1 ? 's' : ''} · {dueSoon.length} renewing within 30 days
        </p>
      </div>

      {/* Plan distribution */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(PLANS).map(([key, plan]) => {
          const Icon = plan.icon
          return (
            <button
              key={key}
              onClick={() => setPlanFilter(planFilter === key ? 'all' : key)}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                planFilter === key
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20'
              }`}
            >
              <Icon className={`h-5 w-5 ${plan.color}`} />
              <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">{planCounts[key]}</p>
              <p className="text-xs font-medium text-slate-500">{plan.label}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">{plan.priceLabel}</p>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <DollarSign className="h-8 w-8 opacity-30" />
          <span className="text-sm">No active subscriptions{planFilter !== 'all' ? ' on this plan' : ' yet'}</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
          {filtered.map((tenant, i) => {
            const plan = PLANS[tenant.plan_type]
            const PlanIcon = plan?.icon
            const renewal = tenant.next_renewal_date ? new Date(tenant.next_renewal_date) : null
            const daysLeft = renewal ? Math.ceil((renewal - Date.now()) / 86400000) : null
            const urgent = daysLeft !== null && daysLeft <= 30

            return (
              <div
                key={tenant.id}
                className={`flex flex-wrap items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/5 ${
                  i < filtered.length - 1 ? 'border-b border-slate-100 dark:border-white/5' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{tenant.name}</p>
                  <p className="font-mono text-xs text-slate-500">{tenant.slug}</p>
                </div>
                {plan && PlanIcon && (
                  <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${plan.bg} ${plan.color}`}>
                    <PlanIcon className="h-3.5 w-3.5" />
                    {plan.label}
                  </span>
                )}
                <span className="text-xs text-slate-500">{plan?.priceLabel}</span>
                <span className={`flex items-center gap-1.5 text-xs ${urgent ? 'font-semibold text-amber-500' : 'text-slate-500'}`}>
                  {urgent ? <AlertTriangle className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
                  {renewal
                    ? `Renews ${renewal.toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' })}${urgent ? ` (${daysLeft}d)` : ''}`
                    : 'No renewal date'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
