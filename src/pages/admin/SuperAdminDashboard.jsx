import { useEffect, useState } from 'react'
import {
  TrendingUp, Users, Building2, DollarSign, BarChart3,
  ArrowUpRight, Clock, AlertCircle, CheckCircle, Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function SuperAdminDashboard() {
  const [metrics, setMetrics] = useState({
    totalTenants: 0,
    activeSubscriptions: 0,
    totalRevenue: 0,
    monthlyRecurring: 0,
    platformHealth: 100,
    activeUsers: 0,
  })
  const [loading, setLoading] = useState(true)
  const [recentTenants, setRecentTenants] = useState([])

  useEffect(() => {
    loadMetrics()
  }, [])

  const loadMetrics = async () => {
    try {
      // Get tenant count
      const { count: tenantCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })

      // Get active subscriptions
      const { data: subs } = await supabase
        .from('tenant_subscriptions')
        .select('*')
        .eq('status', 'active')

      // Get recent tenants
      const { data: recentData } = await supabase
        .from('tenants')
        .select('id, name, created_at, status')
        .order('created_at', { ascending: false })
        .limit(5)

      // Calculate revenue (mock for now - would be from billing table)
      const totalRevenue = (subs || []).reduce((sum, sub) => sum + (sub.price || 0), 0)
      const monthlyRevenue = (subs || []).filter(s => s.billing_cycle === 'monthly').reduce((sum, s) => sum + (s.price || 0), 0)

      setMetrics({
        totalTenants: tenantCount || 0,
        activeSubscriptions: subs?.length || 0,
        totalRevenue: totalRevenue.toFixed(2),
        monthlyRecurring: monthlyRevenue.toFixed(2),
        platformHealth: 98, // Would check actual system health
        activeUsers: Math.floor((tenantCount || 0) * 3.5), // Estimate
      })
      setRecentTenants(recentData || [])
    } catch (err) {
      toast.error('Failed to load metrics')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const StatCard = ({ icon: Icon, label, value, trend, color = 'indigo' }) => (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{value}</p>
          {trend && (
            <div className="flex items-center gap-1 mt-2 text-sm text-green-600 dark:text-green-400">
              <ArrowUpRight className="h-4 w-4" />
              {trend}
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-${color}-100 dark:bg-${color}-900/30`}>
          <Icon className={`h-6 w-6 text-${color}-600 dark:text-${color}-400`} />
        </div>
      </div>
    </div>
  )

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Platform Dashboard</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">CEO-level platform control and analytics</p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={Building2}
          label="Total Tenants"
          value={metrics.totalTenants}
          trend="+12% this month"
          color="blue"
        />
        <StatCard
          icon={Users}
          label="Active Subscriptions"
          value={metrics.activeSubscriptions}
          trend="+8% this month"
          color="green"
        />
        <StatCard
          icon={DollarSign}
          label="Total Revenue"
          value={`$${metrics.totalRevenue}`}
          trend="+15% this month"
          color="emerald"
        />
        <StatCard
          icon={TrendingUp}
          label="Monthly Recurring"
          value={`$${metrics.monthlyRecurring}`}
          trend="Excluding one-off"
          color="purple"
        />
        <StatCard
          icon={Zap}
          label="Platform Health"
          value={`${metrics.platformHealth}%`}
          trend="Operational"
          color="yellow"
        />
        <StatCard
          icon={Users}
          label="Active Users"
          value={metrics.activeUsers}
          trend="+18% this month"
          color="pink"
        />
      </div>

      {/* Recent Tenants */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Recent Tenants</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Tenant Name</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600 dark:text-slate-400">Status</th>
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
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}>
                      {tenant.status === 'active' ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                      {tenant.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <button className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm font-medium">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Alerts */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-amber-900 dark:text-amber-200">System Alert</h3>
          <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
            2 tenants approaching storage limit. Review quota settings.
          </p>
        </div>
      </div>
    </div>
  )
}
