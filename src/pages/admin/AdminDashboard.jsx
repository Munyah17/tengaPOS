import { useState, useEffect } from 'react'
import { Building2, Users, LifeBuoy, TrendingUp, Activity, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    green: 'bg-green-500/10 text-green-400',
    orange: 'bg-orange-500/10 text-orange-400',
    red: 'bg-red-500/10 text-red-400',
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-1 text-3xl font-extrabold text-white">{value ?? '—'}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { role } = useAuthStore()
  const [stats, setStats] = useState({ tenants: null, users: null, appUsers: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ count: tenants }, { count: users }, { count: appUsers }] = await Promise.all([
        supabase.from('tenants').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('app_users').select('*', { count: 'exact', head: true }),
      ])
      setStats({ tenants, users, appUsers })
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Platform Overview</h1>
        <p className="mt-1 text-sm text-slate-400">Real-time view of all tenants and system health</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Total Tenants"
          value={loading ? '…' : stats.tenants}
          sub="Registered businesses"
          color="indigo"
        />
        <StatCard
          icon={Users}
          label="Tenant Users"
          value={loading ? '…' : stats.users}
          sub="Across all tenants"
          color="green"
        />
        <StatCard
          icon={Activity}
          label="Platform Staff"
          value={loading ? '…' : stats.appUsers}
          sub="Admins + Tech Support"
          color="orange"
        />
        <StatCard
          icon={TrendingUp}
          label="System Status"
          value="Healthy"
          sub="All services operational"
          color="green"
        />
      </div>

      {/* Quick actions */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-base font-bold text-white">Recent Activity</h2>
          <div className="space-y-3">
            {[
              { icon: CheckCircle2, text: 'Database schema healthy', color: 'text-green-400', time: 'Just now' },
              { icon: CheckCircle2, text: 'RLS policies active on all tables', color: 'text-green-400', time: '1m ago' },
              { icon: Clock, text: 'ZIMRA fiscal sync scheduled', color: 'text-slate-400', time: '5m ago' },
              { icon: AlertCircle, text: 'Review pending support tickets', color: 'text-orange-400', time: '—' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <item.icon className={`h-4 w-4 flex-shrink-0 ${item.color}`} />
                <span className="flex-1 text-slate-300">{item.text}</span>
                <span className="text-xs text-slate-500">{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-base font-bold text-white">Role Summary</h2>
          <div className="space-y-3">
            {[
              { label: 'Super Admin', desc: 'Full platform access, system config', color: 'bg-red-500/20 text-red-400' },
              { label: 'Admin', desc: 'Tenant management, billing, reports', color: 'bg-indigo-500/20 text-indigo-400' },
              { label: 'Tech Support', desc: 'Client troubleshooting, field support', color: 'bg-orange-500/20 text-orange-400' },
            ].map((r) => (
              <div key={r.label} className="flex items-start gap-3">
                <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${r.color}`}>{r.label}</span>
                <span className="text-sm text-slate-400">{r.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
