import { useEffect, useState } from 'react'
import { Database, HardDrive, Cloud } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PLANS } from '@/pages/admin/AdminTenants'

const BACKUP_LABELS = {
  daily_cloud: 'Daily cloud',
  weekly_cloud: 'Weekly cloud',
  monthly_cloud: 'Monthly cloud',
  daily_local: 'Daily local',
  weekly_local: 'Weekly local',
  monthly_local: 'Monthly local',
}

export default function SuperAdminBackups() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('tenants')
      .select('id, name, slug, plan_type, backup_config, status')
      .in('plan_type', ['business', 'enterprise'])
      .eq('status', 'active')
      .then(({ data }) => {
        setTenants(data || [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Backups & Recovery</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Backup schedules for Business and Enterprise tenants. The platform database itself is
          backed up daily by Supabase (Dashboard → Database → Backups).
        </p>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      ) : tenants.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <Database className="h-8 w-8 opacity-30" />
          <span className="text-sm">No Business or Enterprise tenants yet — backup plans are configured on approval</span>
        </div>
      ) : (
        <div className="space-y-3">
          {tenants.map((tenant) => {
            const cfg = tenant.backup_config || {}
            const schedules = Object.keys(BACKUP_LABELS).filter((k) => cfg[k])
            const plan = PLANS[tenant.plan_type]
            return (
              <div key={tenant.id} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-semibold text-slate-900 dark:text-white">{tenant.name}</p>
                  {plan && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${plan.bg} ${plan.color}`}>{plan.label}</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {schedules.length === 0 ? (
                    <span className="text-xs text-slate-500">No backup schedule configured — set it on the tenant record</span>
                  ) : (
                    schedules.map((k) => (
                      <span key={k} className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {k.includes('cloud') ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
                        {BACKUP_LABELS[k]}
                      </span>
                    ))
                  )}
                </div>
                {cfg.storage_path && (
                  <p className="mt-2 font-mono text-xs text-slate-500">{cfg.storage_path}{cfg.retention_days ? ` · ${cfg.retention_days}d retention` : ''}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
