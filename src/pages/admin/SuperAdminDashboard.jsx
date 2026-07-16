import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Users, Building2, DollarSign,
  Clock, CheckCircle, AlertTriangle, ChevronRight, LifeBuoy,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { TenantModal, PLANS } from '@/pages/admin/AdminTenants'
import toast from 'react-hot-toast'

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [metrics, setMetrics] = useState({
    totalTenants: 0,
    pendingTenants: 0,
    activeTenants: 0,
    monthlyRecurring: 0,
    openTickets: 0,
  })
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState([])
  const [recentTenants, setRecentTenants] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    loadMetrics()
  }, [])

  const loadMetrics = async () => {
    try {
      const [{ data: tenants, error: tenantsError }, { data: techs }, { count: openTickets }] = await Promise.all([
        supabase.from('tenants').select('*').order('created_at', { ascending: false }),
        supabase.from('app_users').select('id, name, email').eq('role', 'tech_support').eq('is_active', true),
        supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
      ])
      if (tenantsError) throw tenantsError

      const all = tenants || []
      const pendingList = all.filter((t) => t.status === 'pending')
      const active = all.filter((t) => t.status === 'active')

      // Monthly recurring = recurring plans only (BYOD). Standard/Pro are once-off.
      const monthly = active.reduce((sum, t) => {
        const plan = PLANS[t.plan_type]
        return plan?.recurring && plan.price ? sum + plan.price : sum
      }, 0)

      setMetrics({
        totalTenants: all.length,
        pendingTenants: pendingList.length,
        activeTenants: active.length,
        monthlyRecurring: monthly.toFixed(2),
        openTickets: openTickets || 0,
      })
      setPending(pendingList)
      setRecentTenants(all.slice(0, 5))
      setTechnicians(techs || [])
    } catch (err) {
      toast.error(err.message || 'Failed to load metrics')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const StatCard = ({ icon: Icon, label, value, sub, color = 'indigo', onClick }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-left w-full ${
        onClick ? 'hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors cursor-pointer' : 'cursor-default'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{value}</p>
          {sub && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
        <div className={`p-3 rounded-lg bg-${color}-100 dark:bg-${color}-900/30`}>
          <Icon className={`h-6 w-6 text-${color}-600 dark:text-${color}-400`} />
        </div>
      </div>
    </button>
  )

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Platform Dashboard</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Full platform control — tenants, revenue, and operations</p>
      </div>

      {/* Pending approvals — the action queue, front and centre */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            <h2 className="text-lg font-bold text-amber-900 dark:text-amber-200">
              {pending.length} business{pending.length > 1 ? 'es' : ''} awaiting approval
            </h2>
          </div>
          <div className="space-y-2">
            {pending.map((tenant) => (
              <div
                key={tenant.id}
                className="flex items-center gap-4 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 px-4 py-3"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/15 font-bold text-amber-600 dark:text-amber-400">
                  {tenant.name?.[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{tenant.name}</p>
                  <p className="text-xs text-slate-500">
                    Registered {new Date(tenant.created_at).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(tenant)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Review & Approve
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key metrics — real data only */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Total Tenants"
          value={metrics.totalTenants}
          sub={`${metrics.activeTenants} active`}
          color="blue"
          onClick={() => navigate('/admin/super/tenants')}
        />
        <StatCard
          icon={Clock}
          label="Pending Approval"
          value={metrics.pendingTenants}
          sub={metrics.pendingTenants > 0 ? 'Needs your action' : 'All caught up'}
          color="amber"
          onClick={() => navigate('/admin/super/tenants')}
        />
        <StatCard
          icon={TrendingUp}
          label="Monthly Recurring"
          value={`$${metrics.monthlyRecurring}`}
          sub="From active plan pricing"
          color="green"
          onClick={() => navigate('/admin/super/billing')}
        />
        <StatCard
          icon={LifeBuoy}
          label="Open Tickets"
          value={metrics.openTickets}
          sub="Open + in progress"
          color="red"
          onClick={() => navigate('/admin/super/support')}
        />
      </div>

      {/* Recent Tenants */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Tenants</h2>
          <button
            onClick={() => navigate('/admin/super/tenants')}
            className="flex items-center gap-1 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            All tenants <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {recentTenants.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No tenants registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Tenant Name</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Plan</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Created</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentTenants.map(tenant => (
                  <tr key={tenant.id} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 text-slate-900 dark:text-white">{tenant.name}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        tenant.status === 'active'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : tenant.status === 'pending'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {tenant.status === 'active' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {tenant.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      {PLANS[tenant.plan_type]?.label || '—'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                      {new Date(tenant.created_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setSelected(tenant)}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium"
                      >
                        {tenant.status === 'pending' ? 'Review' : 'Manage'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <TenantModal
          tenant={selected}
          technicians={technicians}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); loadMetrics() }}
        />
      )}
    </div>
  )
}
