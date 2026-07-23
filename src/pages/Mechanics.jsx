import { useState, useEffect, useMemo } from 'react'
import { HardHat, Wrench, CheckCircle, Clock } from 'lucide-react'
import { formatCurrency } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchStaff, fetchJobCards } from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'

// Workload view over the same staff/job-card data Job Cards already
// manages -- not a new roster, just a mechanic-focused lens on it: who's
// carrying what right now, and how much they've completed.
export default function Mechanics() {
  const { tenant } = useAuthStore()
  const [staff, setStaff] = useState([])
  const [jobCards, setJobCards] = useState([])

  useEffect(() => {
    if (!tenant?.id) return
    fetchStaff(tenant.id).then(setStaff).catch(() => {})
    loadWithOfflineCache(['jobCards', tenant.id], () => fetchJobCards(tenant.id), { onData: setJobCards })
  }, [tenant?.id])

  const rows = useMemo(() => staff.map((s) => {
    const assigned = jobCards.filter((j) => j.assigned_to === s.id)
    const active = assigned.filter((j) => ['open', 'in_progress'].includes(j.status))
    const completed = assigned.filter((j) => j.status === 'completed')
    const revenue = completed.reduce((sum, j) => sum + (Number(j.total) || 0), 0)
    return { staffMember: s, active, completed, revenue }
  }).filter((r) => r.active.length + r.completed.length > 0 || true), [staff, jobCards])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Mechanics</h1>
        <p className="text-sm text-slate-500">Who's carrying what, and what they've completed</p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-700">
          <HardHat className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500">No staff yet — add them in Staff Management</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ staffMember, active, completed, revenue }) => (
            <div key={staffMember.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                  {staffMember.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{staffMember.name}</p>
                  <p className="text-xs capitalize text-slate-500">{staffMember.role?.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-blue-50 p-2 dark:bg-blue-950/40">
                  <p className="flex items-center justify-center gap-1 text-xs text-blue-600 dark:text-blue-400"><Clock className="h-3 w-3" /> Active</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">{active.length}</p>
                </div>
                <div className="rounded-xl bg-green-50 p-2 dark:bg-green-950/40">
                  <p className="flex items-center justify-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle className="h-3 w-3" /> Done</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">{completed.length}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-2 dark:bg-amber-950/40">
                  <p className="flex items-center justify-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Wrench className="h-3 w-3" /> Value</p>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white">{formatCurrency(revenue)}</p>
                </div>
              </div>
              {active.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {active.map((j) => (
                    <p key={j.id} className="truncate text-xs text-slate-500">
                      <span className="font-mono">{j.job_card_no}</span> — {j.vehicles?.reg_number || j.vehicles?.make || 'vehicle'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
