import { useState, useEffect } from 'react'
import {
  BarChart3, TrendingUp, Building2, Users, DollarSign,
  RefreshCw, Clock, CheckCircle, XCircle, Crown, Zap, Star,
  Smartphone, Briefcase, Calendar, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS } from './AdminTenants'

// ─── Plan pricing (monthly equivalent) ───────────────────────────────────────
const PLAN_MRR = {
  byod_monthly:  200,
  standard_plan: 200,
  pro_package:   250,
  business:      500,
  enterprise:    1000,
}

function fmt$(n) {
  return '$' + (n ?? 0).toLocaleString('en-US')
}

function timeAgo(iso) {
  if (!iso) return 'Never'
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-ZW', { month: 'short', day: 'numeric', year: 'numeric' })
}

function KPICard({ icon: Icon, label, value, sub, color = 'indigo', delta }) {
  const colors = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    green:  'bg-green-500/10 text-green-400',
    amber:  'bg-amber-500/10 text-amber-400',
    red:    'bg-red-500/10 text-red-400',
    purple: 'bg-purple-500/10 text-purple-400',
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-1 text-3xl font-extrabold text-white">{value ?? '—'}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
          {delta != null && (
            <p className={`mt-1 text-xs font-semibold ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta >= 0 ? '+' : ''}{delta} this month
            </p>
          )}
        </div>
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function BarRow({ label, value, max, color = 'bg-indigo-500' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 flex-shrink-0 truncate text-xs text-slate-400">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-white/10 h-2">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 flex-shrink-0 text-right text-xs font-semibold text-white">{value}</span>
    </div>
  )
}

export default function AdminReports() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tenantSort, setTenantSort] = useState('name')
  const [tenantSortDir, setTenantSortDir] = useState('asc')
  const [tenantSearch, setTenantSearch] = useState('')

  const load = async () => {
    setLoading(true)

    const now = new Date()
    const thirtyDaysAgo = new Date(now - 30 * 86400 * 1000).toISOString()
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 86400 * 1000).toISOString()

    const [
      { data: tenants },
      { data: userCounts },
      { data: appUsers },
      { data: recentSignups },
      { data: renewalsSoon },
    ] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('tenant_id'),
      supabase.from('app_users').select('id', { count: 'exact', head: false }),
      supabase.from('tenants').select('id').gte('created_at', thirtyDaysAgo),
      supabase.from('tenants')
        .select('id, name, plan_type, next_renewal_date')
        .eq('status', 'active')
        .lte('next_renewal_date', thirtyDaysAhead)
        .gte('next_renewal_date', now.toISOString())
        .order('next_renewal_date', { ascending: true }),
    ])

    const allTenants = tenants || []
    const active    = allTenants.filter((t) => t.status === 'active')
    const pending   = allTenants.filter((t) => t.status === 'pending')
    const suspended = allTenants.filter((t) => t.status === 'suspended')

    // MRR from active tenants by plan
    const mrr = active.reduce((sum, t) => sum + (PLAN_MRR[t.plan_type] || 0), 0)
    const arr = mrr * 12

    // Plan distribution
    const planDist = {}
    active.forEach((t) => {
      planDist[t.plan_type] = (planDist[t.plan_type] || 0) + 1
    })

    // User count per tenant
    const userMap = {}
    ;(userCounts || []).forEach(({ tenant_id }) => {
      userMap[tenant_id] = (userMap[tenant_id] || 0) + 1
    })

    // Enrich tenants with user count
    const enriched = allTenants.map((t) => ({ ...t, user_count: userMap[t.id] || 0 }))

    setData({
      tenants: enriched,
      active, pending, suspended,
      mrr, arr,
      planDist,
      recentSignups: recentSignups?.length || 0,
      renewalsSoon: renewalsSoon || [],
      appUserCount: appUsers?.length || 0,
      totalUsers: (userCounts || []).length,
    })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleSort = (col) => {
    if (tenantSort === col) setTenantSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setTenantSort(col); setTenantSortDir('asc') }
  }

  const SortIcon = ({ col }) => {
    if (tenantSort !== col) return <ChevronDown className="h-3 w-3 text-slate-600" />
    return tenantSortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-indigo-400" />
      : <ChevronDown className="h-3 w-3 text-indigo-400" />
  }

  const sortedTenants = [...(data?.tenants || [])]
    .filter((t) =>
      !tenantSearch ||
      t.name?.toLowerCase().includes(tenantSearch.toLowerCase()) ||
      t.slug?.toLowerCase().includes(tenantSearch.toLowerCase()),
    )
    .sort((a, b) => {
      let av = a[tenantSort] ?? ''
      let bv = b[tenantSort] ?? ''
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av < bv) return tenantSortDir === 'asc' ? -1 : 1
      if (av > bv) return tenantSortDir === 'asc' ? 1 : -1
      return 0
    })

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" /> Loading analytics…
      </div>
    )
  }

  const maxPlan = Math.max(...Object.values(data.planDist), 1)
  const planColors = {
    byod_monthly: 'bg-slate-500',
    standard_plan: 'bg-blue-500',
    pro_package: 'bg-indigo-500',
    business: 'bg-purple-500',
    enterprise: 'bg-amber-500',
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Platform Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">Business intelligence — all tenants, all accounts</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* ── Platform KPIs ── */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Platform Revenue</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICard icon={DollarSign} label="Est. MRR"       value={fmt$(data.mrr)}         sub="Active subscriptions"    color="green"  />
          <KPICard icon={TrendingUp} label="Est. ARR"       value={fmt$(data.arr)}         sub="Annualised run rate"     color="indigo" />
          <KPICard icon={Building2}  label="Active Tenants" value={data.active.length}     sub="Paying accounts"         color="green"  delta={data.recentSignups} />
          <KPICard icon={Clock}      label="Pending"        value={data.pending.length}    sub="Awaiting approval"       color="amber"  />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Platform Scale</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPICard icon={Users}      label="Tenant Users"   value={data.totalUsers}        sub="Across all businesses"   color="indigo" />
          <KPICard icon={Users}      label="Platform Staff" value={data.appUserCount}      sub="Admins + Tech Support"   color="purple" />
          <KPICard icon={XCircle}    label="Suspended"      value={data.suspended.length}  sub="Access revoked"          color="red"    />
          <KPICard icon={Calendar}   label="Renewals Due"   value={data.renewalsSoon.length} sub="Next 30 days"          color="amber"  />
        </div>
      </section>

      {/* ── Plan distribution + Renewals pipeline ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Plan distribution */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-base font-bold text-white">Plan Distribution</h2>
          {Object.keys(data.planDist).length === 0 ? (
            <p className="text-sm text-slate-500">No active paid tenants yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(PLANS).map(([key, meta]) => {
                const count = data.planDist[key] || 0
                if (count === 0) return null
                const revenue = count * (PLAN_MRR[key] || 0)
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className={`font-semibold ${meta.color}`}>{meta.label}</span>
                      <span className="text-slate-400">{fmt$(revenue)}/mo · {count} tenant{count !== 1 ? 's' : ''}</span>
                    </div>
                    <BarRow label="" value={count} max={maxPlan} color={planColors[key]} />
                  </div>
                )
              }).filter(Boolean)}
              <div className="mt-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm">
                <span className="text-slate-400">Total estimated MRR</span>
                <span className="font-extrabold text-green-400">{fmt$(data.mrr)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Upcoming renewals */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-base font-bold text-white">Renewals Due (30 days)</h2>
          {data.renewalsSoon.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-slate-600 text-sm">
              No renewals due in the next 30 days
            </div>
          ) : (
            <div className="space-y-2">
              {data.renewalsSoon.map((t) => {
                const plan = PLANS[t.plan_type]
                const PlanIcon = plan?.icon
                const days = Math.ceil((new Date(t.next_renewal_date) - Date.now()) / 86400000)
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2.5">
                    {PlanIcon && <PlanIcon className={`h-4 w-4 flex-shrink-0 ${plan.color}`} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{t.name}</p>
                      <p className="text-xs text-slate-500">{plan?.label}</p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                      days <= 7 ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {days}d
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Tenant analytics table ── */}
      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-bold text-white">All Tenant Accounts</h2>
          <input
            value={tenantSearch}
            onChange={(e) => setTenantSearch(e.target.value)}
            placeholder="Search…"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none w-full sm:w-48"
          />
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-bold uppercase tracking-widest text-slate-500">
                {[
                  { col: 'name',              label: 'Tenant' },
                  { col: 'status',            label: 'Status' },
                  { col: 'plan_type',         label: 'Plan' },
                  { col: 'user_count',        label: 'Users' },
                  { col: 'next_renewal_date', label: 'Renewal' },
                  { col: 'created_at',        label: 'Joined' },
                ].map(({ col, label }) => (
                  <th
                    key={col}
                    onClick={() => toggleSort(col)}
                    className="cursor-pointer select-none px-4 py-3 hover:text-slate-300"
                  >
                    <span className="flex items-center gap-1">{label} <SortIcon col={col} /></span>
                  </th>
                ))}
                <th className="px-4 py-3">Features</th>
              </tr>
            </thead>
            <tbody>
              {sortedTenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-600">No tenants found</td>
                </tr>
              ) : sortedTenants.map((t, i) => {
                const status = { pending: 'text-amber-400', active: 'text-green-400', suspended: 'text-red-400' }[t.status] || 'text-slate-400'
                const plan = t.plan_type ? PLANS[t.plan_type] : null
                const PlanIcon = plan?.icon
                const renewal = t.next_renewal_date
                  ? new Date(t.next_renewal_date).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: '2-digit' })
                  : '—'
                const joined = new Date(t.created_at).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: '2-digit' })
                const featureCount = Object.values(t.features || {}).filter((v) => v === true).length
                const renewalDays = t.next_renewal_date
                  ? Math.ceil((new Date(t.next_renewal_date) - Date.now()) / 86400000)
                  : null

                return (
                  <tr
                    key={t.id}
                    className={`border-b border-white/5 hover:bg-white/5 transition-colors ${i % 2 === 0 ? '' : 'bg-white/2'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-xs font-bold text-indigo-400">
                          {t.name?.[0]}
                        </span>
                        <div>
                          <p className="font-semibold text-white">{t.name}</p>
                          <p className="text-[10px] font-mono text-slate-600">{t.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`capitalize text-xs font-semibold ${status}`}>{t.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {plan && PlanIcon ? (
                        <span className={`flex items-center gap-1 text-xs font-semibold ${plan.color}`}>
                          <PlanIcon className="h-3 w-3" />{plan.label}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{t.user_count}</td>
                    <td className="px-4 py-3">
                      {renewalDays != null ? (
                        <div>
                          <p className="text-slate-300">{renewal}</p>
                          {renewalDays <= 30 && (
                            <p className={`text-[10px] font-semibold ${renewalDays <= 7 ? 'text-red-400' : 'text-amber-400'}`}>
                              {renewalDays}d left
                            </p>
                          )}
                        </div>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{joined}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {featureCount > 0 && (
                          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400">
                            {featureCount} modules
                          </span>
                        )}
                        {t.whitelabel?.enabled && (
                          <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">WL</span>
                        )}
                        {t.dedicated_technician_id && (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">Tech</span>
                        )}
                        {Object.values(t.backup_config || {}).some(Boolean) && (
                          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400">BK</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Revenue breakdown ── */}
      <section>
        <h2 className="mb-3 text-base font-bold text-white">Revenue Breakdown by Plan</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Object.entries(PLANS).map(([key, meta]) => {
            const count = data.planDist[key] || 0
            const monthlyRev = count * (PLAN_MRR[key] || 0)
            const Icon = meta.icon
            return (
              <div key={key} className={`rounded-2xl border p-4 ${meta.border} ${meta.bg}`}>
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`h-5 w-5 ${meta.color}`} />
                  <span className={`text-xs font-bold ${meta.color}`}>{count} active</span>
                </div>
                <p className={`text-sm font-bold ${meta.color}`}>{meta.label}</p>
                <p className="mt-1 text-xl font-extrabold text-white">{fmt$(monthlyRev)}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{fmt$(PLAN_MRR[key])}/tenant/mo</p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
