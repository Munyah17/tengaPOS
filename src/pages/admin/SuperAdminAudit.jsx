import { useEffect, useState } from 'react'
import { Shield, CheckCircle, XCircle, RefreshCw, FileEdit, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const ACTION_META = {
  tenant_approved:   { icon: CheckCircle, color: 'text-green-500 bg-green-500/10', label: 'Tenant Approved' },
  tenant_suspended:  { icon: XCircle, color: 'text-red-500 bg-red-500/10', label: 'Tenant Suspended' },
  tenant_reinstated: { icon: RefreshCw, color: 'text-blue-500 bg-blue-500/10', label: 'Tenant Reinstated' },
  tenant_updated:    { icon: FileEdit, color: 'text-indigo-500 bg-indigo-500/10', label: 'Tenant Updated' },
  announcement_sent: { icon: FileEdit, color: 'text-purple-500 bg-purple-500/10', label: 'Announcement Sent' },
}

export default function SuperAdminAudit() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setLogs(data || [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every platform-level action — approvals, suspensions, plan changes, broadcasts
        </p>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <Shield className="h-8 w-8 opacity-30" />
          <span className="text-sm">No audit entries yet — actions are recorded from now on</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
          {logs.map((log, i) => {
            const meta = ACTION_META[log.action] || { icon: FileEdit, color: 'text-slate-500 bg-slate-500/10', label: log.action }
            const Icon = meta.icon
            return (
              <div
                key={log.id}
                className={`flex items-start gap-4 px-5 py-4 ${i < logs.length - 1 ? 'border-b border-slate-100 dark:border-white/5' : ''}`}
              >
                <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {meta.label}
                    {log.details?.tenant_name && <span className="font-normal text-slate-500"> — {log.details.tenant_name}</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    by {log.actor_email || 'unknown'}
                    {log.details?.plan_type && ` · plan: ${log.details.plan_type}`}
                  </p>
                </div>
                <span className="flex flex-shrink-0 items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {new Date(log.created_at).toLocaleString('en-ZW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
