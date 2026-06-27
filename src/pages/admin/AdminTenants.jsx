import { useState, useEffect } from 'react'
import { Building2, Search, ChevronRight, Calendar, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

const PLAN_BADGE = {
  byod: { bg: 'bg-slate-700', text: 'text-slate-300', label: 'BYOD' },
  starter: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Starter' },
  pro: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', label: 'Pro' },
  enterprise: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Enterprise' },
}

export default function AdminTenants() {
  const { role } = useAuthStore()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const canManage = role === 'super_admin' || role === 'admin'

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('tenants')
        .select('*, users(count), branches(count)')
        .order('created_at', { ascending: false })
      if (!error) setTenants(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Tenants</h1>
          <p className="mt-1 text-sm text-slate-400">{tenants.length} registered businesses</p>
        </div>
        <div className="relative max-w-xs flex-1 sm:flex-none">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants..."
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading tenants…</div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <Building2 className="h-8 w-8 opacity-30" />
          <span className="text-sm">No tenants found</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {filtered.map((tenant, i) => {
            const plan = PLAN_BADGE[tenant.plan] || PLAN_BADGE.byod
            const date = new Date(tenant.created_at).toLocaleDateString('en-ZW', { year: 'numeric', month: 'short', day: 'numeric' })
            return (
              <div
                key={tenant.id}
                className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/5 ${
                  i < filtered.length - 1 ? 'border-b border-white/5' : ''
                }`}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-lg font-extrabold text-indigo-400">
                  {tenant.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{tenant.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${plan.bg} ${plan.text}`}>
                      {plan.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="font-mono">{tenant.slug}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {date}
                    </span>
                  </div>
                </div>
                {canManage && (
                  <button className="flex-shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
