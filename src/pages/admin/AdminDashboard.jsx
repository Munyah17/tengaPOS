import { useState, useEffect } from 'react'
import { LifeBuoy, AlertCircle, CheckCircle, Clock, Users, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Link } from 'react-router-dom'
import { toLocalDateStr } from '@/utils/formatters'

export default function AdminDashboard() {
  const { role } = useAuthStore()
  const [stats, setStats] = useState({
    openTickets: 0,
    inProgress: 0,
    resolvedToday: 0,
    totalTickets: 0,
  })
  const [recentTickets, setRecentTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const today = toLocalDateStr()
      const [{ count: open }, { count: inProgress }, { count: total }, { count: resolved }, { data: tickets }] = await Promise.all([
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'in_progress'),
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }),
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'resolved').gte('updated_at', `${today}T00:00:00`),
        supabase.from('support_tickets').select('*, tenants(name)').order('created_at', { ascending: false }).limit(8),
      ])

      setStats({
        openTickets: open || 0,
        inProgress: inProgress || 0,
        resolvedToday: resolved || 0,
        totalTickets: total || 0,
      })
      setRecentTickets(tickets || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const StatCard = ({ icon: Icon, label, value, color = 'indigo' }) => (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className={`p-2.5 rounded-lg bg-${color}-100 dark:bg-${color}-900/30`}>
          <Icon className={`h-5 w-5 text-${color}-600 dark:text-${color}-400`} />
        </div>
      </div>
    </div>
  )

  if (loading) {
    return <div className="p-6">Loading operations dashboard...</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Operations Dashboard</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">Support tickets, customer issues, and operational overview</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={AlertCircle} label="Open Tickets" value={stats.openTickets} color="red" />
        <StatCard icon={Clock} label="In Progress" value={stats.inProgress} color="blue" />
        <StatCard icon={CheckCircle} label="Resolved Today" value={stats.resolvedToday} color="green" />
        <StatCard icon={Users} label="Total Handled" value={stats.totalTickets} color="purple" />
      </div>

      {/* Recent Support Tickets */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recent Support Tickets</h2>
          </div>
          <Link to="/admin/support" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            View All
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Ticket ID</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Issue</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Status</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentTickets.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-600 dark:text-slate-400">
                    No tickets yet. Great job staying on top!
                  </td>
                </tr>
              ) : (
                recentTickets.map(ticket => (
                  <tr key={ticket.id} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400">TKT-{String(ticket.ticket_no).padStart(4, '0')}</td>
                    <td className="py-3 px-4 text-slate-900 dark:text-white">{ticket.subject}{ticket.tenants?.name ? ` — ${ticket.tenants.name}` : ''}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        ticket.status === 'resolved'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : ticket.status === 'in_progress'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      }`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Link to={`/admin/support`} className="text-indigo-600 dark:text-indigo-400 hover:underline text-xs font-medium">
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-blue-900 dark:text-blue-200">Admin Operations Only</h3>
          <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
            This dashboard shows day-to-day operations. For platform control, see Super Admin dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}
