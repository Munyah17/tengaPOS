import { useEffect, useState } from 'react'
import { Activity, Database, KeyRound, Building2, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function SuperAdminHealth() {
  const [checks, setChecks] = useState(null)
  const [running, setRunning] = useState(false)

  const runChecks = async () => {
    setRunning(true)
    const results = {}

    // Database reachability + latency
    const t0 = performance.now()
    const { error: dbError } = await supabase.from('tenants').select('id', { count: 'exact', head: true })
    results.db = { ok: !dbError, latency: Math.round(performance.now() - t0), error: dbError?.message }

    // Auth service
    const t1 = performance.now()
    const { data: sessionData, error: authError } = await supabase.auth.getSession()
    results.auth = {
      ok: !authError && !!sessionData?.session,
      latency: Math.round(performance.now() - t1),
      error: authError?.message || (!sessionData?.session ? 'No active session' : null),
    }

    // Tenant stats
    const [{ count: total }, { count: active }, { count: pending }] = await Promise.all([
      supabase.from('tenants').select('id', { count: 'exact', head: true }),
      supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    results.tenants = { total: total || 0, active: active || 0, pending: pending || 0 }

    results.checkedAt = new Date()
    setChecks(results)
    setRunning(false)
  }

  useEffect(() => { runChecks() }, [])

  const StatusRow = ({ icon: Icon, label, ok, detail }) => (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-white/10 dark:bg-white/5">
      <Icon className="h-5 w-5 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      {ok ? (
        <span className="flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-600 dark:text-green-400">
          <CheckCircle className="h-3.5 w-3.5" /> Operational
        </span>
      ) : (
        <span className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
          <XCircle className="h-3.5 w-3.5" /> Issue
        </span>
      )}
    </div>
  )

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">System Health</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Live checks against the production backend
            {checks?.checkedAt && ` · last checked ${checks.checkedAt.toLocaleTimeString()}`}
          </p>
        </div>
        <button
          onClick={runChecks}
          disabled={running}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
          Re-check
        </button>
      </div>

      {!checks ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Running checks…</div>
      ) : (
        <div className="space-y-3">
          <StatusRow
            icon={Database}
            label="Database (Supabase Postgres)"
            ok={checks.db.ok}
            detail={checks.db.ok ? `Responding in ${checks.db.latency}ms` : checks.db.error}
          />
          <StatusRow
            icon={KeyRound}
            label="Authentication Service"
            ok={checks.auth.ok}
            detail={checks.auth.ok ? `Session valid · ${checks.auth.latency}ms` : checks.auth.error}
          />
          <StatusRow
            icon={Building2}
            label="Tenant Platform"
            ok={true}
            detail={`${checks.tenants.total} tenants · ${checks.tenants.active} active · ${checks.tenants.pending} pending approval`}
          />
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            <Activity className="mt-0.5 h-4 w-4 flex-shrink-0" />
            Edge functions (ZIMRA, Paynow, insights) are verified per-tenant from their own portals,
            since each uses tenant-specific credentials.
          </div>
        </div>
      )}
    </div>
  )
}
