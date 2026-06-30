import { useState, useEffect } from 'react'
import { Building2, Users, Activity, TrendingUp, CheckCircle2, Clock, AlertCircle, Bell, RefreshCw, CreditCard } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Link } from 'react-router-dom'

const TYPE_META = {
  new_signup:  { color: 'text-amber-400',  icon: Building2,  label: 'New Signup' },
  renewal_due: { color: 'text-indigo-400', icon: RefreshCw,  label: 'Renewal Due' },
  payment_due: { color: 'text-green-400',  icon: CreditCard, label: 'Payment Due' },
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function StatCard({ icon: Icon, label, value, sub, color = 'indigo', to }) {
  const colors = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    green:  'bg-green-500/10 text-green-400',
    orange: 'bg-orange-500/10 text-orange-400',
    amber:  'bg-amber-500/10 text-amber-400',
    red:    'bg-red-500/10 text-red-400',
  }
  const card = (
    <div className={`rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 p-5 ${to ? 'hover:bg-white/8 transition-colors cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-white">{value ?? '—'}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
  return to ? <Link to={to}>{card}</Link> : card
}

export default function AdminDashboard() {
  const { role } = useAuthStore()
  const [stats, setStats] = useState({ tenants: null, pending: null, users: null, appUsers: null })
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Trigger renewal notification generation silently
      supabase.rpc('create_renewal_notifications').then(() => {})

      const [
        { count: tenants },
        { count: pending },
        { count: users },
        { count: appUsers },
        { data: notifs },
      ] = await Promise.all([
        supabase.from('tenants').select('*', { count: 'exact', head: true }),
        supabase.from('tenants').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('app_users').select('*', { count: 'exact', head: true }),
        supabase.from('admin_notifications')
          .select('*, tenants(name)')
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      setStats({ tenants, pending, users, appUsers })
      setNotifications(notifs || [])
      setLoading(false)
    }
    load()
  }, [])

  const unread = notifications.filter((n) => !n.is_read).length

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Platform Overview</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Real-time view of all tenants and system health</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2}   label="Total Tenants"    value={loading ? '…' : stats.tenants}   sub="All registered businesses" color="indigo" />
        <StatCard icon={Clock}       label="Pending Approval" value={loading ? '…' : stats.pending}   sub="Awaiting admin review"      color="amber"  to="/admin/tenants" />
        <StatCard icon={Users}       label="Tenant Users"     value={loading ? '…' : stats.users}     sub="Across all tenants"         color="green"  />
        <StatCard icon={Activity}    label="Platform Staff"   value={loading ? '…' : stats.appUsers}  sub="Admins + Tech Support"      color="orange" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Recent notifications */}
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-indigo-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Notifications</h2>
              {unread > 0 && (
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-bold text-indigo-400">{unread} new</span>
              )}
            </div>
            <Link to="/admin/notifications" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : notifications.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-slate-600 text-sm">No notifications</div>
          ) : (
            <div className="space-y-2">
              {notifications.slice(0, 5).map((n) => {
                const meta = TYPE_META[n.type] || TYPE_META.new_signup
                const Icon = meta.icon
                return (
                  <div key={n.id} className={`flex items-start gap-3 rounded-xl p-3 ${n.is_read ? 'opacity-50' : 'bg-white/5'}`}>
                    <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${meta.color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight">{n.title}</p>
                      {n.tenants && <p className="text-xs text-slate-500">{n.tenants.name}</p>}
                    </div>
                    <span className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-600">{timeAgo(n.created_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Role summary */}
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 p-5">
          <h2 className="mb-4 text-base font-bold text-slate-900 dark:text-white">Role Summary</h2>
          <div className="space-y-3">
            {[
              { label: 'Super Admin', desc: 'Full platform access, system config', color: 'bg-red-500/20 text-red-400' },
              { label: 'Admin', desc: 'Tenant approval, billing, plan management', color: 'bg-indigo-500/20 text-indigo-400' },
              { label: 'Tech Support', desc: 'Client troubleshooting, field support', color: 'bg-orange-500/20 text-orange-400' },
            ].map((r) => (
              <div key={r.label} className="flex items-start gap-3">
                <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${r.color}`}>{r.label}</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">{r.desc}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-white/10 pt-4">
            <h3 className="mb-3 text-sm font-bold text-white">Plan Types</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-slate-700/50 px-2 py-0.5 text-xs font-semibold text-slate-300">BYOD Monthly</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">Own device, monthly renewal</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-indigo-300">Combo 6-Month</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">Hardware bundle, 6-month renewal</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
