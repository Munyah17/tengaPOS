import { useState, useEffect } from 'react'
import { Bell, Building2, RefreshCw, CheckCheck, Clock, AlertTriangle, CreditCard } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

const TYPE_META = {
  new_signup:   { icon: Building2,    color: 'text-amber-400',  bg: 'bg-amber-500/10',  label: 'New Signup' },
  renewal_due:  { icon: RefreshCw,    color: 'text-indigo-400', bg: 'bg-indigo-500/10', label: 'Renewal Due' },
  payment_due:  { icon: CreditCard,   color: 'text-green-400',  bg: 'bg-green-500/10',  label: 'Payment Due' },
}

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('admin_notifications')
      .select('*, tenants(name, slug)')
      .order('created_at', { ascending: false })
      .limit(100)
    setNotifications(data || [])
    setLoading(false)
  }

  const checkRenewals = async () => {
    setRefreshing(true)
    await supabase.rpc('create_renewal_notifications')
    await load()
    setRefreshing(false)
    toast.success('Renewal check complete')
  }

  const markAllRead = async () => {
    await supabase
      .from('admin_notifications')
      .update({ is_read: true })
      .eq('is_read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  const markRead = async (id) => {
    await supabase.from('admin_notifications').update({ is_read: true }).eq('id', id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
  }

  useEffect(() => { load() }, [])

  const unread = notifications.filter((n) => !n.is_read).length

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-400">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={checkRenewals}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Check Renewals
          </button>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 rounded-xl bg-indigo-600/20 px-4 py-2 text-sm font-semibold text-indigo-400 hover:bg-indigo-600/30"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      ) : notifications.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <Bell className="h-8 w-8 opacity-30" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.new_signup
            const Icon = meta.icon
            return (
              <button
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
                  n.is_read
                    ? 'border-white/5 bg-white/2 opacity-60'
                    : 'border-white/10 bg-white/5 hover:bg-white/8'
                }`}
              >
                <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${meta.bg}`}>
                  <Icon className={`h-4 w-4 ${meta.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">{n.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.bg} ${meta.color}`}>
                      {meta.label}
                    </span>
                    {!n.is_read && (
                      <span className="h-2 w-2 flex-shrink-0 rounded-full bg-indigo-400" />
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-400">{n.body}</p>
                  {n.tenants && (
                    <p className="mt-1 font-mono text-xs text-slate-600">{n.tenants.slug}</p>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1 text-xs text-slate-600">
                  <Clock className="h-3 w-3" />
                  {timeAgo(n.created_at)}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
