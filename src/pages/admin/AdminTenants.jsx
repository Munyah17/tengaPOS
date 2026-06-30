import { useState, useEffect } from 'react'
import { Building2, Search, Calendar, CheckCircle, Clock, XCircle, Smartphone, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

const STATUS_BADGE = {
  pending:   { bg: 'bg-amber-500/20',  text: 'text-amber-400',  label: 'Pending',   icon: Clock },
  active:    { bg: 'bg-green-500/20',  text: 'text-green-400',  label: 'Active',    icon: CheckCircle },
  suspended: { bg: 'bg-red-500/20',    text: 'text-red-400',    label: 'Suspended', icon: XCircle },
}

const PLAN_META = {
  byod_monthly:  { label: 'BYOD Monthly',    icon: Smartphone, color: 'text-slate-300', bg: 'bg-slate-700/50' },
  combo_6month:  { label: 'Combo 6-Month',   icon: Package,    color: 'text-indigo-300', bg: 'bg-indigo-500/20' },
}

function ApproveModal({ tenant, onClose, onApproved }) {
  const [planType, setPlanType] = useState('combo_6month')
  const [loading, setLoading] = useState(false)
  const { user } = useAuthStore()

  const approve = async () => {
    setLoading(true)
    const now = new Date()
    const renewalDate = new Date(now)
    if (planType === 'combo_6month') {
      renewalDate.setMonth(renewalDate.getMonth() + 6)
    } else {
      renewalDate.setMonth(renewalDate.getMonth() + 1)
    }

    const { error } = await supabase
      .from('tenants')
      .update({
        status: 'active',
        plan_type: planType,
        plan_start_date: now.toISOString(),
        next_renewal_date: renewalDate.toISOString(),
        approved_at: now.toISOString(),
        approved_by: user?.id,
      })
      .eq('id', tenant.id)

    if (error) {
      toast.error('Failed to approve: ' + error.message)
    } else {
      toast.success(`${tenant.name} approved on ${PLAN_META[planType].label} plan`)
      onApproved()
    }
    setLoading(false)
  }

  const suspend = async () => {
    setLoading(true)
    const { error } = await supabase
      .from('tenants')
      .update({ status: 'suspended' })
      .eq('id', tenant.id)
    if (error) toast.error(error.message)
    else { toast.success(`${tenant.name} suspended`); onApproved() }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-lg font-extrabold text-indigo-400">
            {tenant.name[0]}
          </div>
          <div>
            <p className="font-bold text-white">{tenant.name}</p>
            <p className="text-xs text-slate-500 font-mono">{tenant.slug}</p>
          </div>
        </div>

        <p className="mb-4 text-sm font-semibold text-slate-300">Assign Plan</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {Object.entries(PLAN_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setPlanType(key)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${
                planType === key
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              <meta.icon className={`h-6 w-6 ${planType === key ? 'text-indigo-400' : 'text-slate-500'}`} />
              <div>
                <p className={`text-xs font-bold ${planType === key ? 'text-indigo-300' : 'text-slate-400'}`}>
                  {meta.label}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {key === 'byod_monthly' ? 'Monthly renewal' : '6-month renewal'}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={approve}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
          >
            <CheckCircle className="h-4 w-4" />
            {loading ? 'Approving…' : 'Approve & Activate'}
          </button>
          {tenant.status === 'active' && (
            <button
              onClick={suspend}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/20 py-3 text-sm font-bold text-red-400 hover:bg-red-600/30 disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" />
              Suspend Access
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-white/10 py-3 text-sm font-medium text-slate-400 hover:border-white/20 hover:text-white"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminTenants() {
  const { role } = useAuthStore()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('pending')
  const [selected, setSelected] = useState(null)
  const canManage = role === 'super_admin' || role === 'admin'

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('tenants')
      .select('*, users(count)')
      .order('created_at', { ascending: false })
    if (!error) setTenants(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const byTab = {
    pending:  tenants.filter((t) => t.status === 'pending'),
    active:   tenants.filter((t) => t.status === 'active'),
    suspended: tenants.filter((t) => t.status === 'suspended'),
    all:      tenants,
  }

  const counts = {
    pending:  byTab.pending.length,
    active:   byTab.active.length,
    suspended: byTab.suspended.length,
    all:      tenants.length,
  }

  const filtered = (byTab[tab] || []).filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()),
  )

  const tabs = [
    { id: 'pending',  label: 'Pending',   urgent: true },
    { id: 'active',   label: 'Active' },
    { id: 'suspended', label: 'Suspended' },
    { id: 'all',      label: 'All' },
  ]

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

      {/* Tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
              tab === t.id
                ? 'bg-white/20 text-white'
                : t.urgent && counts[t.id] > 0
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-white/10 text-slate-500'
            }`}>
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <Building2 className="h-8 w-8 opacity-30" />
          <span className="text-sm">No {tab} tenants</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {filtered.map((tenant, i) => {
            const status = STATUS_BADGE[tenant.status] || STATUS_BADGE.pending
            const StatusIcon = status.icon
            const plan = tenant.plan_type ? PLAN_META[tenant.plan_type] : null
            const PlanIcon = plan?.icon
            const date = new Date(tenant.created_at).toLocaleDateString('en-ZW', { year: 'numeric', month: 'short', day: 'numeric' })
            const renewalDate = tenant.next_renewal_date
              ? new Date(tenant.next_renewal_date).toLocaleDateString('en-ZW', { year: 'numeric', month: 'short', day: 'numeric' })
              : null

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
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${status.bg} ${status.text}`}>
                      <StatusIcon className="h-3 w-3" />{status.label}
                    </span>
                    {plan && PlanIcon && (
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${plan.bg} ${plan.color}`}>
                        <PlanIcon className="h-3 w-3" />{plan.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="font-mono">{tenant.slug}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{date}</span>
                    {renewalDate && (
                      <span className="flex items-center gap-1 text-indigo-400">
                        Renews {renewalDate}
                      </span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => setSelected(tenant)}
                    className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      tenant.status === 'pending'
                        ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {tenant.status === 'pending' ? 'Review' : 'Manage'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <ApproveModal
          tenant={selected}
          onClose={() => setSelected(null)}
          onApproved={() => { setSelected(null); load() }}
        />
      )}
    </div>
  )
}
