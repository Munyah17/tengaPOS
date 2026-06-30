import { useState, useEffect } from 'react'
import {
  Building2, Search, Calendar, CheckCircle, Clock, XCircle,
  Smartphone, Star, Zap, Briefcase, Crown,
  ToggleLeft, ToggleRight, Palette, HardDrive, Users, ChevronRight,
  Save, AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

// ─── Plan metadata ────────────────────────────────────────────────────────────

export const PLANS = {
  byod_monthly: {
    label: 'BYOD Monthly',
    icon: Smartphone,
    color: 'text-slate-300',
    bg: 'bg-slate-700/50',
    border: 'border-slate-600',
    renewalMonths: 1,
    tier: 1,
    desc: 'Own device · Monthly billing',
  },
  standard_plan: {
    label: 'Standard Plan',
    icon: Star,
    color: 'text-blue-300',
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/40',
    renewalMonths: 6,
    tier: 2,
    desc: 'Combo hardware · 6-month renewal',
  },
  pro_package: {
    label: 'Pro Package',
    icon: Zap,
    color: 'text-indigo-300',
    bg: 'bg-indigo-500/20',
    border: 'border-indigo-500/40',
    renewalMonths: 6,
    tier: 3,
    desc: 'Combo hardware · 6-month renewal',
  },
  business: {
    label: 'Business',
    icon: Briefcase,
    color: 'text-purple-300',
    bg: 'bg-purple-500/20',
    border: 'border-purple-500/40',
    renewalMonths: 12,
    tier: 4,
    desc: 'White-label · Backups · Dedicated tech',
  },
  enterprise: {
    label: 'Enterprise',
    icon: Crown,
    color: 'text-amber-300',
    bg: 'bg-amber-500/20',
    border: 'border-amber-500/40',
    renewalMonths: 12,
    tier: 5,
    desc: 'Full custom · Unlimited · Priority support',
  },
}

const DEFAULT_FEATURES = {
  byod_monthly: {
    pos: true, inventory: true, transactions: true,
    reports: 'basic', staff: false, tasks: true,
    kitchen: false, orders: false, dining_board: false,
    drive_through: false, fiscalisation: false,
    branches: 1, max_users: 3, api_access: false,
  },
  standard_plan: {
    pos: true, inventory: true, transactions: true,
    reports: 'basic', staff: true, tasks: true,
    kitchen: true, orders: true, dining_board: false,
    drive_through: false, fiscalisation: true,
    branches: 1, max_users: 5, api_access: false,
  },
  pro_package: {
    pos: true, inventory: true, transactions: true,
    reports: 'advanced', staff: true, tasks: true,
    kitchen: true, orders: true, dining_board: true,
    drive_through: true, fiscalisation: true,
    branches: 3, max_users: 10, api_access: false,
  },
  business: {
    pos: true, inventory: true, transactions: true,
    reports: 'advanced', staff: true, tasks: true,
    kitchen: true, orders: true, dining_board: true,
    drive_through: true, fiscalisation: true,
    branches: 10, max_users: 25, api_access: true,
  },
  enterprise: {
    pos: true, inventory: true, transactions: true,
    reports: 'advanced', staff: true, tasks: true,
    kitchen: true, orders: true, dining_board: true,
    drive_through: true, fiscalisation: true,
    branches: -1, max_users: -1, api_access: true,
    custom_integrations: true,
  },
}

const DEFAULT_BACKUP = {
  byod_monthly:  {},
  standard_plan: {},
  pro_package:   {},
  business:      { daily_cloud: true, weekly_cloud: true, monthly_cloud: true, weekly_local: true, monthly_local: true },
  enterprise:    { daily_cloud: true, weekly_cloud: true, monthly_cloud: true, daily_local: true, weekly_local: true, monthly_local: true },
}

const STATUS_BADGE = {
  pending:   { bg: 'bg-amber-500/20', text: 'text-amber-400',  label: 'Pending',   icon: Clock },
  active:    { bg: 'bg-green-500/20', text: 'text-green-400',  label: 'Active',    icon: CheckCircle },
  suspended: { bg: 'bg-red-500/20',   text: 'text-red-400',    label: 'Suspended', icon: XCircle },
}

const BOOL_FEATURES = [
  { key: 'pos',            label: 'POS / Sales' },
  { key: 'inventory',      label: 'Inventory Management' },
  { key: 'transactions',   label: 'Transaction History' },
  { key: 'staff',          label: 'Staff Management' },
  { key: 'tasks',          label: 'Task Manager' },
  { key: 'kitchen',        label: 'Kitchen Display' },
  { key: 'orders',         label: 'Orders Board' },
  { key: 'dining_board',   label: 'Customer Dining Board' },
  { key: 'drive_through',  label: 'Drive-Through Mode' },
  { key: 'fiscalisation',  label: 'Fiscalisation (ZIMRA)' },
  { key: 'api_access',     label: 'API Access' },
  { key: 'custom_integrations', label: 'Custom Integrations' },
]

const BACKUP_OPTIONS = [
  { key: 'daily_cloud',    label: 'Daily — Cloud' },
  { key: 'weekly_cloud',   label: 'Weekly — Cloud' },
  { key: 'monthly_cloud',  label: 'Monthly — Cloud' },
  { key: 'daily_local',    label: 'Daily — Local' },
  { key: 'weekly_local',   label: 'Weekly — Local' },
  { key: 'monthly_local',  label: 'Monthly — Local' },
]

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      className={`relative flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-indigo-600' : 'bg-slate-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
        value ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

const TABS = ['Plan', 'Features', 'Branding', 'Backups', 'Team']

function TenantModal({ tenant, technicians, onClose, onSaved }) {
  const { user } = useAuthStore()
  const [tab, setTab] = useState('Plan')
  const [saving, setSaving] = useState(false)

  const isPending = tenant.status === 'pending'
  const isHighTier = ['business', 'enterprise'].includes(tenant.plan_type)

  const [planType, setPlanType] = useState(tenant.plan_type || 'standard_plan')
  const [features, setFeatures] = useState({ ...DEFAULT_FEATURES[tenant.plan_type || 'standard_plan'], ...(tenant.features || {}) })
  const [whitelabel, setWhitelabel] = useState(tenant.whitelabel || {})
  const [backupConfig, setBackupConfig] = useState(tenant.backup_config || {})
  const [technicianId, setTechnicianId] = useState(tenant.dedicated_technician_id || '')

  const currentIsHighTier = ['business', 'enterprise'].includes(planType)

  const applyPlanDefaults = (plan) => {
    setPlanType(plan)
    setFeatures(DEFAULT_FEATURES[plan])
    setBackupConfig(DEFAULT_BACKUP[plan])
    if (!['business', 'enterprise'].includes(plan)) {
      setWhitelabel({})
      setTechnicianId('')
    }
  }

  const setFeature = (key, val) => setFeatures((f) => ({ ...f, [key]: val }))
  const setWL = (key, val) => setWhitelabel((w) => ({ ...w, [key]: val }))
  const setBackup = (key, val) => setBackupConfig((b) => ({ ...b, [key]: val }))

  const save = async (newStatus) => {
    setSaving(true)
    const now = new Date()
    const renewalDate = new Date(now)
    renewalDate.setMonth(renewalDate.getMonth() + (PLANS[planType]?.renewalMonths || 6))

    const updates = {
      plan_type: planType,
      features,
      whitelabel: currentIsHighTier ? whitelabel : {},
      backup_config: currentIsHighTier ? backupConfig : {},
      dedicated_technician_id: currentIsHighTier && technicianId ? technicianId : null,
    }

    if (newStatus) {
      updates.status = newStatus
      if (newStatus === 'active' && isPending) {
        updates.plan_start_date = now.toISOString()
        updates.next_renewal_date = renewalDate.toISOString()
        updates.approved_at = now.toISOString()
        updates.approved_by = user?.id
      }
    }

    const { error } = await supabase.from('tenants').update(updates).eq('id', tenant.id)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(newStatus === 'active' && isPending
        ? `${tenant.name} approved on ${PLANS[planType]?.label}`
        : 'Tenant updated')
      onSaved()
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-lg font-extrabold text-indigo-400">
            {tenant.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-white truncate">{tenant.name}</p>
            <p className="text-xs font-mono text-slate-500">{tenant.slug}</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-4 pt-3">
          {TABS.map((t) => {
            const locked = ['Branding', 'Backups', 'Team'].includes(t) && !currentIsHighTier
            return (
              <button
                key={t}
                onClick={() => !locked && setTab(t)}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === t
                    ? 'border-b-2 border-indigo-500 text-indigo-400'
                    : locked
                      ? 'cursor-not-allowed text-slate-700'
                      : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t}
                {locked && <Crown className="h-3 w-3 text-amber-600" />}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── Plan tab ── */}
          {tab === 'Plan' && (
            <div>
              <p className="mb-4 text-sm font-semibold text-slate-300">Select Plan</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(PLANS).map(([key, meta]) => {
                  const Icon = meta.icon
                  const active = planType === key
                  return (
                    <button
                      key={key}
                      onClick={() => applyPlanDefaults(key)}
                      className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                        active ? `${meta.border} ${meta.bg}` : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${active ? meta.color : 'text-slate-600'}`} />
                      <div>
                        <p className={`text-sm font-bold ${active ? meta.color : 'text-slate-400'}`}>{meta.label}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{meta.desc}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Renewal period info */}
              <div className="mt-4 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-400">
                Renewal cycle: <span className="font-semibold text-white">
                  {PLANS[planType]?.renewalMonths === 1 ? 'Monthly' : `Every ${PLANS[planType]?.renewalMonths} months`}
                </span>
              </div>

              {currentIsHighTier && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
                  <Crown className="h-4 w-4 flex-shrink-0" />
                  Branding, Backups, and Team tabs are now unlocked for this plan.
                </div>
              )}
            </div>
          )}

          {/* ── Features tab ── */}
          {tab === 'Features' && (
            <div className="space-y-5">
              {/* Boolean toggles */}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Module Access</p>
                <div className="divide-y divide-white/5 rounded-xl border border-white/10">
                  {BOOL_FEATURES.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-slate-300">{label}</span>
                      <Toggle
                        value={!!features[key]}
                        onChange={(v) => setFeature(key, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Numeric limits */}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Limits</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'branches', label: 'Max Branches', hint: '-1 = unlimited' },
                    { key: 'max_users', label: 'Max Users', hint: '-1 = unlimited' },
                  ].map(({ key, label, hint }) => (
                    <div key={key} className="rounded-xl border border-white/10 p-3">
                      <label className="text-xs font-semibold text-slate-400">{label}</label>
                      <input
                        type="number"
                        value={features[key] ?? ''}
                        onChange={(e) => setFeature(key, Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                      />
                      <p className="mt-1 text-[10px] text-slate-600">{hint}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reports tier */}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Reports Level</p>
                <div className="grid grid-cols-2 gap-2">
                  {['basic', 'advanced'].map((tier) => (
                    <button
                      key={tier}
                      onClick={() => setFeature('reports', tier)}
                      className={`rounded-xl border px-4 py-3 text-sm font-semibold capitalize transition-colors ${
                        features.reports === tier
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                          : 'border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Branding tab ── */}
          {tab === 'Branding' && currentIsHighTier && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3 text-sm text-purple-300">
                <Palette className="h-4 w-4 flex-shrink-0" />
                Full white-label — the tenant's brand replaces tengaPOS branding in their portal.
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">Enable White-Label</p>
                  <p className="text-xs text-slate-500">Client sees their own brand, not tengaPOS</p>
                </div>
                <Toggle value={!!whitelabel.enabled} onChange={(v) => setWL('enabled', v)} />
              </div>

              {[
                { key: 'brand_name',     label: 'Brand Name',      placeholder: 'e.g. AcmePOS', type: 'text' },
                { key: 'logo_url',       label: 'Logo URL',        placeholder: 'https://…/logo.png', type: 'url' },
                { key: 'favicon_url',    label: 'Favicon URL',     placeholder: 'https://…/favicon.ico', type: 'url' },
                { key: 'primary_color',  label: 'Primary Colour',  placeholder: '#0066CC', type: 'text' },
                { key: 'secondary_color', label: 'Accent Colour',  placeholder: '#FF6600', type: 'text' },
                { key: 'support_email',  label: 'Support Email',   placeholder: 'support@client.com', type: 'email' },
                { key: 'support_phone',  label: 'Support Phone',   placeholder: '+263…', type: 'text' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-slate-400">{label}</label>
                  <input
                    type={type}
                    value={whitelabel[key] || ''}
                    onChange={(e) => setWL(key, e.target.value)}
                    placeholder={placeholder}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              ))}

              {whitelabel.primary_color && (
                <div className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
                  <div className="h-8 w-8 rounded-lg border border-white/20" style={{ backgroundColor: whitelabel.primary_color }} />
                  <div className="h-8 w-8 rounded-lg border border-white/20" style={{ backgroundColor: whitelabel.secondary_color || '#ccc' }} />
                  <span className="text-xs text-slate-500">Colour preview</span>
                </div>
              )}
            </div>
          )}

          {/* ── Backups tab ── */}
          {tab === 'Backups' && currentIsHighTier && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300">
                <HardDrive className="h-4 w-4 flex-shrink-0" />
                Configure automated backup schedules for cloud and local storage.
              </div>

              <div className="divide-y divide-white/5 rounded-xl border border-white/10">
                {BACKUP_OPTIONS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-slate-300">{label}</span>
                    <Toggle
                      value={!!backupConfig[key]}
                      onChange={(v) => setBackup(key, v)}
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Backup Storage Path / Bucket</label>
                <input
                  type="text"
                  value={backupConfig.storage_path || ''}
                  onChange={(e) => setBackup('storage_path', e.target.value)}
                  placeholder="s3://bucket/tenant-slug or /local/path"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Retention (days)</label>
                <input
                  type="number"
                  value={backupConfig.retention_days || ''}
                  onChange={(e) => setBackup('retention_days', Number(e.target.value))}
                  placeholder="e.g. 90"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* ── Team tab ── */}
          {tab === 'Team' && currentIsHighTier && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-sm text-green-300">
                <Users className="h-4 w-4 flex-shrink-0" />
                Assign a dedicated tengaPOS technician who owns this account's field support.
              </div>

              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Dedicated Technician</p>

                <button
                  onClick={() => setTechnicianId('')}
                  className={`mb-2 flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    !technicianId ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-400">—</span>
                  <span className="text-sm text-slate-400">No dedicated technician</span>
                </button>

                {technicians.length === 0 ? (
                  <p className="text-sm text-slate-500">No technicians found. Add tech_support staff first.</p>
                ) : (
                  <div className="space-y-2">
                    {technicians.map((tech) => (
                      <button
                        key={tech.id}
                        onClick={() => setTechnicianId(tech.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                          technicianId === tech.id
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-bold text-indigo-400">
                          {tech.name?.[0] || '?'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{tech.name}</p>
                          <p className="text-xs text-slate-500">{tech.email}</p>
                        </div>
                        {technicianId === tech.id && (
                          <CheckCircle className="h-4 w-4 flex-shrink-0 text-indigo-400" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-shrink-0 flex-col gap-2 border-t border-white/10 p-5">
          {isPending ? (
            <button
              onClick={() => save('active')}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60"
            >
              <CheckCircle className="h-4 w-4" />
              {saving ? 'Saving…' : `Approve & Activate — ${PLANS[planType]?.label}`}
            </button>
          ) : (
            <button
              onClick={() => save(null)}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}

          {tenant.status === 'active' && (
            <button
              onClick={() => save('suspended')}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/10 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-600/20 disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" />
              Suspend Access
            </button>
          )}
          {tenant.status === 'suspended' && (
            <button
              onClick={() => save('active')}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600/10 py-2.5 text-sm font-semibold text-green-400 hover:bg-green-600/20 disabled:opacity-60"
            >
              <CheckCircle className="h-4 w-4" />
              Reinstate Access
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminTenants() {
  const { role } = useAuthStore()
  const [tenants, setTenants] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('pending')
  const [selected, setSelected] = useState(null)
  const canManage = role === 'super_admin' || role === 'admin'

  const load = async () => {
    setLoading(true)
    const [{ data: tenantData }, { data: techData }] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at', { ascending: false }),
      supabase.from('app_users').select('id, name, email').eq('role', 'tech_support').eq('is_active', true),
    ])
    setTenants(tenantData || [])
    setTechnicians(techData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const byTab = {
    pending:   tenants.filter((t) => t.status === 'pending'),
    active:    tenants.filter((t) => t.status === 'active'),
    suspended: tenants.filter((t) => t.status === 'suspended'),
    all:       tenants,
  }
  const counts = { pending: byTab.pending.length, active: byTab.active.length, suspended: byTab.suspended.length, all: tenants.length }

  const filtered = (byTab[tab] || []).filter(
    (t) => t.name?.toLowerCase().includes(search.toLowerCase()) || t.slug?.toLowerCase().includes(search.toLowerCase()),
  )

  const tabs = [
    { id: 'pending',   label: 'Pending',   urgent: true },
    { id: 'active',    label: 'Active' },
    { id: 'suspended', label: 'Suspended' },
    { id: 'all',       label: 'All' },
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
            placeholder="Search tenants…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

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
              tab === t.id ? 'bg-white/20 text-white'
              : t.urgent && counts[t.id] > 0 ? 'bg-amber-500/20 text-amber-400'
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
            const plan = tenant.plan_type ? PLANS[tenant.plan_type] : null
            const PlanIcon = plan?.icon
            const date = new Date(tenant.created_at).toLocaleDateString('en-ZW', { year: 'numeric', month: 'short', day: 'numeric' })
            const renewalDate = tenant.next_renewal_date
              ? new Date(tenant.next_renewal_date).toLocaleDateString('en-ZW', { year: 'numeric', month: 'short', day: 'numeric' })
              : null

            return (
              <div
                key={tenant.id}
                className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/5 ${i < filtered.length - 1 ? 'border-b border-white/5' : ''}`}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-lg font-extrabold text-indigo-400">
                  {tenant.name?.[0]}
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
                      <span className="text-indigo-400">Renews {renewalDate}</span>
                    )}
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => setSelected(tenant)}
                    className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      tenant.status === 'pending'
                        ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {tenant.status === 'pending' ? 'Review' : 'Manage'}
                    <ChevronRight className="h-3 w-3" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <TenantModal
          tenant={selected}
          technicians={technicians}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load() }}
        />
      )}
    </div>
  )
}
