import { useState, useEffect } from 'react'
import {
  Building2, Search, Calendar, CheckCircle, Clock, XCircle,
  Smartphone, Star, Zap, Briefcase, Crown,
  ToggleLeft, ToggleRight, Palette, HardDrive, Users, ChevronRight,
  Save, AlertCircle, Trash2, ShieldAlert, Ban, PauseCircle, Mail, Phone, Eye,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { buildShadeScale, INDUSTRIES } from '@/lib/whitelabelTheme'
import { invokeEdgeFunction } from '@/lib/edgeFunction'
import { usePlanPricing, priceLabelFor } from '@/lib/platformSettings'
import toast from 'react-hot-toast'

// ─── Plan metadata ────────────────────────────────────────────────────────────

export const PLANS = {
  byod_monthly: {
    label: 'BYOD Monthly',
    icon: Smartphone,
    color: 'text-slate-300',
    bg: 'bg-slate-200 dark:bg-slate-700/50',
    border: 'border-slate-600',
    renewalMonths: 1,
    tier: 1,
    price: 30,
    recurring: true,
    priceLabel: '$30 / month',
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
    price: 170,
    recurring: false,
    priceLabel: '$170 once-off · 6 months included',
    renewalNote: 'Free renewal — Ts & Cs apply',
    desc: 'Combo hardware · Free renewal (Ts & Cs apply)',
  },
  pro_package: {
    label: 'Pro Package',
    icon: Zap,
    color: 'text-indigo-300',
    bg: 'bg-indigo-500/20',
    border: 'border-indigo-500/40',
    renewalMonths: 6,
    tier: 3,
    price: 200,
    recurring: false,
    priceLabel: '$200 once-off · 6 months included',
    renewalNote: 'Free renewal — Ts & Cs apply',
    desc: 'Combo hardware · Free renewal (Ts & Cs apply)',
  },
  business: {
    label: 'Business',
    icon: Briefcase,
    color: 'text-purple-300',
    bg: 'bg-purple-500/20',
    border: 'border-purple-500/40',
    renewalMonths: 12,
    tier: 4,
    price: null,
    recurring: false,
    priceLabel: 'Custom quote',
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
    price: null,
    recurring: false,
    priceLabel: 'Custom quote',
    desc: 'Full custom · Unlimited · Priority support',
  },
}

export const DEFAULT_FEATURES = {
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
    drive_through: false, fiscalisation: false,
    branches: 3, max_users_per_branch: 2, api_access: false,
  },
  pro_package: {
    pos: true, inventory: true, transactions: true,
    reports: 'advanced', staff: true, tasks: true,
    kitchen: true, orders: true, dining_board: true,
    drive_through: true, fiscalisation: false,
    branches: 5, max_users_per_branch: 4, api_access: false,
  },
  business: {
    pos: true, inventory: true, transactions: true,
    reports: 'advanced', staff: true, tasks: true,
    kitchen: true, orders: true, dining_board: true,
    drive_through: true, fiscalisation: false,
    branches: 10, max_users: 25, api_access: true,
  },
  enterprise: {
    pos: true, inventory: true, transactions: true,
    reports: 'advanced', staff: true, tasks: true,
    kitchen: true, orders: true, dining_board: true,
    drive_through: true, fiscalisation: false,
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
  deleted:   { bg: 'bg-slate-500/20', text: 'text-slate-400',  label: 'Deleted',   icon: Trash2 },
  rejected:  { bg: 'bg-red-500/20',   text: 'text-red-400',    label: 'Rejected',  icon: Ban },
  stalled:   { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Stalled',  icon: PauseCircle },
}

const TEAM_SIZE_LABELS = { '1-5': '1–5', '6-15': '6–15', '16-30': '16–30', '31-50': '31–50', '50+': '50+' }
const PLAN_PREF_LABELS = { byod: 'BYOD (own device)', combo: 'Hardware Combo', undecided: 'Not sure yet' }

// Every paid add-on's unlock flag is included here too, so a custom
// Enterprise/Business plan can grant or revoke any single feature by hand —
// independent of that add-on's own request/approve flow — instead of being
// limited to whatever the plan-tier defaults bundle together.
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
  { key: 'vat',            label: 'VAT' },
  { key: 'accounting_erp', label: 'Accounting & ERP (HR, Payroll, Invoicing)' },
  { key: 'ai_insights',    label: 'AI Insights' },
  { key: 'api_access',     label: 'API Access' },
  { key: 'custom_integrations', label: 'Custom Integrations' },
]

const BUSINESS_MODES = [
  { key: 'retail', label: 'Retail' },
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'workshop', label: 'Workshop' },
  { key: 'hardware', label: 'Hardware' },
  { key: 'manufacturing', label: 'Manufacturing' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'bar', label: 'Bar / Liquor Store' },
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
        value ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
        value ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

const TABS = ['Application', 'Plan', 'Features', 'Branding', 'Backups', 'Team']

export function TenantModal({ tenant, technicians, onClose, onSaved }) {
  const { user, role } = useAuthStore()
  const { pricing } = usePlanPricing()
  const isSuperAdminUser = role === 'super_admin'
  const isPending = tenant.status === 'pending'
  const isStalled = tenant.status === 'stalled'
  const [tab, setTab] = useState(isPending || isStalled ? 'Application' : 'Plan')
  const [saving, setSaving] = useState(false)
  const [dangerAction, setDangerAction] = useState(null) // 'terminate' | 'delete' | null
  const [dangerInput, setDangerInput] = useState('')
  const [dangerBusy, setDangerBusy] = useState(false)
  const [decisionAction, setDecisionAction] = useState(null) // 'reject' | 'stall' | null
  const [decisionReason, setDecisionReason] = useState('')
  const [decisionBusy, setDecisionBusy] = useState(false)

  const isHighTier = ['business', 'enterprise'].includes(tenant.plan_type)

  const [planType, setPlanType] = useState(tenant.plan_type || 'standard_plan')
  const [features, setFeatures] = useState({ ...DEFAULT_FEATURES[tenant.plan_type || 'standard_plan'], ...(tenant.features || {}) })
  const [posMode, setPosModeField] = useState(tenant.pos_mode || 'retail')
  const [enabledModes, setEnabledModes] = useState(tenant.enabled_modes?.length ? tenant.enabled_modes : [tenant.pos_mode || 'retail'])
  const [whitelabel, setWhitelabel] = useState(tenant.whitelabel || {})
  const [backupConfig, setBackupConfig] = useState(tenant.backup_config || {})
  const [technicianId, setTechnicianId] = useState(tenant.dedicated_technician_id || '')

  // Application tab was read-only display of what was typed at signup --
  // Super Admin couldn't fix a typo'd business name or update an address
  // without going around the app entirely. Now editable, same save() as
  // everything else in this modal.
  const [appForm, setAppForm] = useState({
    name: tenant.name || '',
    industry: tenant.industry || '',
    location: tenant.location || '',
    workAddress: tenant.work_address || '',
    workContact: tenant.work_contact || '',
    specialRequirements: tenant.special_requirements || '',
  })
  const setApp = (key, val) => setAppForm((f) => ({ ...f, [key]: val }))

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

  const onTrial = tenant.trial_ends_at && !tenant.plan_start_date
  // Same eligibility rule as the tenant's own self-serve trial button in
  // Checkout.jsx -- Super Admin can now grant it directly too, for signups
  // handled over the phone/WhatsApp rather than through that page.
  const trialEligible = !tenant.trial_ends_at && !tenant.plan_start_date

  const [pendingCashCheckout, setPendingCashCheckout] = useState(null)
  const [cashLoading, setCashLoading] = useState(false)
  useEffect(() => {
    supabase.from('signup_checkouts').select('id, plan_type, amount, reference, created_at')
      .eq('tenant_id', tenant.id).eq('status', 'pending_cash')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setPendingCashCheckout(data || null))
  }, [tenant.id])

  const confirmCashPayment = async () => {
    if (!pendingCashCheckout) return
    setCashLoading(true)
    try {
      const { error } = await supabase.rpc('confirm_cash_signup', { p_checkout_id: pendingCashCheckout.id })
      if (error) throw error
      toast.success(`${tenant.name}'s cash payment confirmed — plan activated`)
      setPendingCashCheckout(null)
      onSaved()
    } catch (err) {
      toast.error(err.message || 'Failed to confirm payment')
    } finally {
      setCashLoading(false)
    }
  }

  // "View as Tenant" -- signs the caller in as this business's own Vendor
  // account (full rights, not a restricted view), for support/operations.
  // The current admin session is stashed first so AppLayout's banner can
  // restore it on "Exit to Super Admin" -- see viewAsTenant().
  const [impersonating, setImpersonating] = useState(false)
  const viewAsTenant = async () => {
    setImpersonating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('admin-impersonate-tenant', {
        body: { tenant_id: tenant.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error) {
        let msg = error.message
        try { const ctx = await error.context?.json(); if (ctx?.error) msg = ctx.error } catch { /* keep default */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      sessionStorage.setItem('tengapos_admin_return_session', JSON.stringify({
        access_token: session.access_token, refresh_token: session.refresh_token,
      }))
      sessionStorage.setItem('tengapos_impersonating_tenant', data.tenant_name)
      await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
      // Hard navigation, not client-side routing -- guarantees every bit of
      // in-memory state (React Query cache, cart/receipt/theme stores) is
      // wiped clean for the new identity instead of carrying anything over.
      window.location.href = '/app/dashboard'
    } catch (err) {
      toast.error(err.message || 'Could not view as this tenant')
      setImpersonating(false)
    }
  }

  const [trialGranting, setTrialGranting] = useState(false)
  const grantTrial = async () => {
    setTrialGranting(true)
    try {
      const { error } = await supabase.rpc('grant_free_trial', { p_tenant_id: tenant.id })
      if (error) throw error
      toast.success(`${tenant.name} is now on a 7-day free trial`)
      onSaved()
    } catch (err) {
      toast.error(err.message || 'Failed to grant trial')
    } finally {
      setTrialGranting(false)
    }
  }

  const extendTrial = async () => {
    const base = new Date(tenant.trial_ends_at) > new Date() ? new Date(tenant.trial_ends_at) : new Date()
    const newEnd = new Date(base.getTime() + 7 * 86400000)
    const { data: updated, error } = await supabase
      .from('tenants')
      .update({ trial_ends_at: newEnd.toISOString(), status: 'active' })
      .eq('id', tenant.id)
      .select('id')
    if (error || !updated?.length) {
      toast.error(error?.message || 'Update blocked by database permissions')
      return
    }
    await supabase.from('audit_logs').insert({
      actor_id: user?.id,
      actor_email: user?.email,
      action: 'trial_extended',
      target_type: 'tenant',
      target_id: tenant.id,
      details: { tenant_name: tenant.name, new_trial_end: newEnd.toISOString() },
    })
    toast.success(`${tenant.name}'s trial extended to ${newEnd.toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })}`)
    onSaved()
  }

  const setFeature = (key, val) => setFeatures((f) => ({ ...f, [key]: val }))
  const setWL = (key, val) => setWhitelabel((w) => ({ ...w, [key]: val }))
  const setBackup = (key, val) => setBackupConfig((b) => ({ ...b, [key]: val }))

  // A tenant always gets exactly the mode it signed up with by default;
  // Super Admin is the only one who can add more on top (never fewer than
  // one) -- setting the primary mode always keeps it enabled too.
  const setPrimaryMode = (m) => {
    setPosModeField(m)
    setEnabledModes((prev) => (prev.includes(m) ? prev : [...prev, m]))
  }
  const toggleEnabledMode = (m) => {
    if (m === posMode) return // can't disable the tenant's current default mode
    setEnabledModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  const save = async (newStatus) => {
    setSaving(true)
    const now = new Date()
    const renewalDate = new Date(now)
    renewalDate.setMonth(renewalDate.getMonth() + (PLANS[planType]?.renewalMonths || 6))

    const updates = {
      name: appForm.name.trim() || tenant.name,
      industry: appForm.industry.trim() || null,
      location: appForm.location.trim() || null,
      work_address: appForm.workAddress.trim() || null,
      work_contact: appForm.workContact.trim() || null,
      special_requirements: appForm.specialRequirements.trim() || null,
      plan_type: planType,
      features,
      pos_mode: posMode,
      enabled_modes: enabledModes,
      whitelabel,
      backup_config: backupConfig,
      dedicated_technician_id: technicianId || null,
    }

    if (newStatus) {
      updates.status = newStatus
    }
    // Assigning a plan ends the trial — whether that happens by approving a
    // pending signup, or by picking a plan for a tenant already active on trial
    // (isPending is false there, so the old check below never fired and the
    // trial banner kept showing even after a real plan was assigned).
    if ((newStatus === 'active' && isPending) || (onTrial && !isPending)) {
      updates.plan_start_date = now.toISOString()
      updates.next_renewal_date = renewalDate.toISOString()
      updates.approved_at = now.toISOString()
      updates.approved_by = user?.id
    }

    const { data: updated, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', tenant.id)
      .select('id')
    if (error) {
      toast.error(error.message)
    } else if (!updated || updated.length === 0) {
      // RLS silently blocked the write — surface it instead of a false success
      toast.error('Update blocked by database permissions. Run the super_admin_launch.sql migration in Supabase.')
    } else {
      const action = newStatus === 'active' && isPending ? 'tenant_approved'
        : newStatus === 'suspended' ? 'tenant_suspended'
        : newStatus === 'active' ? 'tenant_reinstated'
        : 'tenant_updated'
      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        actor_email: user?.email,
        action,
        target_type: 'tenant',
        target_id: tenant.id,
        details: { tenant_name: tenant.name, plan_type: planType, status: newStatus || tenant.status },
      })

      // This is the moment money actually changed hands for a tenant
      // approved/converted directly by the Super Admin (phone/WhatsApp deals,
      // trial-to-paid conversions) rather than through Checkout.jsx's Stripe/
      // Paynow/cash-request flow -- without this, Billing & Revenue showed
      // zero collected revenue no matter how many tenants were actually
      // paying, because this was the only activation path with no payment
      // record at all. Skip if a formal pending cash request already exists
      // for this tenant -- confirmCashPayment() records that one instead, so
      // recording here too would double-count the same payment.
      if (((newStatus === 'active' && isPending) || (onTrial && !isPending)) && !pendingCashCheckout) {
        const price = pricing[planType]?.price ?? PLANS[planType]?.price
        if (price) {
          await supabase.from('subscription_payments').insert({
            tenant_id: tenant.id,
            provider: 'cash',
            plan_type: planType,
            amount: price,
            currency: 'USD',
          })
        }
      }
      toast.success(newStatus === 'active' && isPending
        ? `${tenant.name} approved on ${PLANS[planType]?.label}`
        : 'Tenant updated')
      const emailTemplate = { tenant_approved: 'approved', tenant_suspended: 'suspended', tenant_reinstated: 'reinstated' }[action]
      if (emailTemplate) {
        supabase.functions.invoke('send-tenant-email', { body: { tenant_id: tenant.id, template: emailTemplate } }).catch(() => {})
      }
      onSaved()
    }
    setSaving(false)
  }

  const decideApplication = async (kind) => {
    if (!decisionReason.trim()) { toast.error('A reason is required'); return }
    setDecisionBusy(true)
    const status = kind === 'reject' ? 'rejected' : 'stalled'
    const reasonField = kind === 'reject' ? 'rejection_reason' : 'stalled_reason'
    const { data: updated, error } = await supabase
      .from('tenants')
      .update({ status, [reasonField]: decisionReason.trim(), decided_at: new Date().toISOString() })
      .eq('id', tenant.id)
      .select('id')
    if (error || !updated?.length) {
      toast.error(error?.message || 'Update blocked by database permissions')
      setDecisionBusy(false)
      return
    }
    await supabase.from('audit_logs').insert({
      actor_id: user?.id,
      actor_email: user?.email,
      action: kind === 'reject' ? 'tenant_rejected' : 'tenant_stalled',
      target_type: 'tenant',
      target_id: tenant.id,
      details: { tenant_name: tenant.name, reason: decisionReason.trim() },
    })
    toast.success(kind === 'reject' ? `${tenant.name} rejected` : `${tenant.name} put on hold`)
    supabase.functions.invoke('send-tenant-email', {
      body: { tenant_id: tenant.id, template: kind === 'reject' ? 'rejected' : 'stalled', extra: { reason: decisionReason.trim() } },
    }).catch(() => {})
    setDecisionBusy(false)
    onSaved()
  }

  const terminateTenant = async () => {
    if (!dangerInput.trim()) { toast.error('A reason is required'); return }
    setDangerBusy(true)
    const { error } = await supabase.from('tenants').update({
      status: 'deleted',
      terminated_at: new Date().toISOString(),
      termination_reason: dangerInput.trim(),
    }).eq('id', tenant.id)
    if (error) {
      toast.error(error.message)
      setDangerBusy(false)
      return
    }
    await supabase.from('audit_logs').insert({
      actor_id: user?.id,
      actor_email: user?.email,
      action: 'tenant_terminated',
      target_type: 'tenant',
      target_id: tenant.id,
      details: { tenant_name: tenant.name, reason: dangerInput.trim() },
    })
    toast.success(`${tenant.name} terminated`)
    setDangerBusy(false)
    onSaved()
  }

  const deleteTenantPermanently = async () => {
    if (dangerInput.trim() !== tenant.name) { toast.error('Type the exact business name to confirm'); return }
    setDangerBusy(true)
    await supabase.from('audit_logs').insert({
      actor_id: user?.id,
      actor_email: user?.email,
      action: 'tenant_deleted_permanently',
      target_type: 'tenant',
      target_id: tenant.id,
      details: { tenant_name: tenant.name },
    })
    const { error } = await supabase.from('tenants').delete().eq('id', tenant.id)
    if (error) {
      toast.error(error.message)
      setDangerBusy(false)
      return
    }
    toast.success(`${tenant.name} permanently deleted`)
    setDangerBusy(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-slate-900" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-white/10 p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-lg font-extrabold text-indigo-400">
            {tenant.name[0]}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900 dark:text-white truncate">{tenant.name}</p>
            <p className="text-xs font-mono text-slate-500">{tenant.slug}</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs — Super Admin has full control on every tab, regardless of plan */}
        <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-4 pt-3">
          {TABS.map((t) => {
            const premium = ['Branding', 'Backups', 'Team'].includes(t) && !currentIsHighTier
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex flex-shrink-0 items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === t
                    ? 'border-b-2 border-indigo-500 text-indigo-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title={premium ? 'Normally a Business/Enterprise feature — you can still configure it' : undefined}
              >
                {t}
                {premium && <Crown className="h-3 w-3 text-amber-600" />}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── Application tab — everything typed at signup ── */}
          {tab === 'Application' && (
            <div className="space-y-4">
              {(tenant.status === 'rejected' || tenant.status === 'stalled') && (
                <div className={`rounded-xl border p-3 text-sm ${tenant.status === 'rejected' ? 'border-red-500/30 bg-red-500/5 text-red-400' : 'border-orange-500/30 bg-orange-500/5 text-orange-400'}`}>
                  <p className="font-semibold">{tenant.status === 'rejected' ? 'Rejected' : 'On hold'}</p>
                  <p className="mt-0.5">{tenant.status === 'rejected' ? tenant.rejection_reason : tenant.stalled_reason}</p>
                </div>
              )}
              {/* Owner's own contact details and signup-time preferences --
                  informational only here; edit the owner via User
                  Management (they're a real `users` row, not a tenant field). */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  ['Contact Name', tenant.owner?.name],
                  ['Email', tenant.owner?.email],
                  ['Phone', tenant.owner?.phone],
                  ['Business Type (at signup)', BUSINESS_MODES.find((m) => m.key === tenant.pos_mode)?.label || 'Retail'],
                  ['Branches Planned', tenant.requested_branches],
                  ['Team Size', TEAM_SIZE_LABELS[tenant.team_size_range] || tenant.team_size_range],
                  ['Preferred Plan', PLAN_PREF_LABELS[tenant.requested_plan_pref] || tenant.requested_plan_pref],
                  ['Signed Up', new Date(tenant.created_at).toLocaleString('en-ZW')],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                    <p className="mt-0.5 text-sm text-slate-900 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              {/* Editable business record -- fixes a typo'd name/address, or
                  updates it as the business itself changes, without needing
                  to go around the app. */}
              <div className="grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Business Name</label>
                  <input value={appForm.name} onChange={(e) => setApp('name', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Industry</label>
                  <select value={appForm.industry} onChange={(e) => setApp('industry', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white">
                    <option value="">—</option>
                    {INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Location</label>
                  <input value={appForm.location} onChange={(e) => setApp('location', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Work Contact</label>
                  <input value={appForm.workContact} onChange={(e) => setApp('workContact', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Work Address</label>
                  <input value={appForm.workAddress} onChange={(e) => setApp('workAddress', e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Special Requirements</label>
                  <textarea value={appForm.specialRequirements} onChange={(e) => setApp('specialRequirements', e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white" />
                </div>
              </div>
            </div>
          )}

          {/* ── Plan tab ── */}
          {tab === 'Plan' && (
            <div>
              {/* Business Modes -- Retail/Restaurant/Workshop. A tenant gets
                  exactly the mode it signed up with by default; this is the
                  only place another mode can be added on top (e.g. a
                  workshop client who also wants retail-style counter
                  sales). Independent of plan tier -- any plan can run any
                  mode(s). */}
              <p className="mb-2 text-sm font-semibold text-slate-300">Business Modes</p>
              <div className="mb-2 grid grid-cols-3 gap-2">
                {BUSINESS_MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setPrimaryMode(m.key)}
                    className={`rounded-xl border p-3 text-center transition-all ${
                      posMode === m.key
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500 dark:text-indigo-400'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'
                    }`}
                  >
                    <p className="text-xs font-bold">{m.label}</p>
                    <p className="mt-0.5 text-[10px] opacity-70">{posMode === m.key ? 'Default mode' : 'Set as default'}</p>
                  </button>
                ))}
              </div>
              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5">
                {BUSINESS_MODES.filter((m) => m.key !== posMode).map((m) => (
                  <label key={m.key} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={enabledModes.includes(m.key)}
                      onChange={() => toggleEnabledMode(m.key)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    Also enable {m.label}
                  </label>
                ))}
              </div>

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
                        active ? `${meta.border} ${meta.bg}` : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/5'
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
              <div className="mt-4 rounded-xl border border-slate-100 dark:border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-400">
                Billing: <span className="font-semibold text-slate-900 dark:text-white">
                  {priceLabelFor(planType, { ...PLANS[planType], ...pricing[planType] })}
                </span>
                {PLANS[planType]?.renewalNote && (
                  <span className="ml-2 text-green-500 dark:text-green-400 font-medium">{PLANS[planType].renewalNote}</span>
                )}
              </div>

              {currentIsHighTier && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-400">
                  <Crown className="h-4 w-4 flex-shrink-0" />
                  Branding, Backups, and Team tabs are now unlocked for this plan.
                </div>
              )}

              {/* Trial controls */}
              {onTrial && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
                  <p className="text-sm text-green-500 dark:text-green-400">
                    On free trial — {new Date(tenant.trial_ends_at) > new Date()
                      ? `ends ${new Date(tenant.trial_ends_at).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })}`
                      : 'expired'}
                  </p>
                  <button
                    onClick={extendTrial}
                    disabled={saving}
                    className="rounded-lg bg-green-600/20 px-3 py-1.5 text-xs font-bold text-green-500 hover:bg-green-600/30 dark:text-green-400"
                  >
                    Extend trial +7 days
                  </button>
                </div>
              )}

              {/* Grant a trial directly -- for signups handled by phone/
                  WhatsApp that never went through Checkout.jsx themselves */}
              {trialEligible && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3">
                  <p className="text-sm text-green-500 dark:text-green-400">Not on a trial or paid plan yet</p>
                  <button
                    onClick={grantTrial}
                    disabled={trialGranting}
                    className="rounded-lg bg-green-600/20 px-3 py-1.5 text-xs font-bold text-green-500 hover:bg-green-600/30 disabled:opacity-60 dark:text-green-400"
                  >
                    {trialGranting ? 'Granting…' : 'Grant 7-Day Free Trial'}
                  </button>
                </div>
              )}

              {/* Pending cash signup payment -- from Checkout.jsx's Cash option */}
              {pendingCashCheckout && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <p className="text-sm text-amber-500 dark:text-amber-400">
                    Cash payment pending — {PLANS[pendingCashCheckout.plan_type]?.label || pendingCashCheckout.plan_type}, ${pendingCashCheckout.amount}
                  </p>
                  <button
                    onClick={confirmCashPayment}
                    disabled={cashLoading}
                    className="rounded-lg bg-amber-600/20 px-3 py-1.5 text-xs font-bold text-amber-600 hover:bg-amber-600/30 disabled:opacity-60 dark:text-amber-400"
                  >
                    {cashLoading ? 'Confirming…' : 'Confirm Payment Received'}
                  </button>
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
                      <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
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
                    ...(features.max_users_per_branch !== undefined
                      ? [{ key: 'max_users_per_branch', label: 'Users per Branch', hint: 'Staff under each vendor/branch' }]
                      : []),
                  ].map(({ key, label, hint }) => (
                    <div key={key} className="rounded-xl border border-white/10 p-3">
                      <label className="text-xs font-semibold text-slate-400">{label}</label>
                      <input
                        type="number"
                        value={features[key] ?? ''}
                        onChange={(e) => setFeature(key, Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
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
          {tab === 'Branding' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3 text-sm text-purple-300">
                <Palette className="h-4 w-4 flex-shrink-0" />
                Full white-label — the tenant's brand replaces tengaPOS branding in their portal.
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Enable White-Label</p>
                  <p className="text-xs text-slate-500">Client sees their own brand, not tengaPOS</p>
                </div>
                <Toggle value={!!whitelabel.enabled} onChange={(v) => setWL('enabled', v)} />
              </div>

              {/* Identity */}
              {[
                { key: 'brand_name',     label: 'Brand Name',      placeholder: 'e.g. AcmePOS', type: 'text' },
                { key: 'tagline',        label: 'Tagline (shown in browser tab)', placeholder: 'e.g. Pharmacy Point of Sale', type: 'text' },
                { key: 'logo_url',       label: 'Logo URL (sidebar + receipts branding)', placeholder: 'https://…/logo.png', type: 'url' },
                { key: 'favicon_url',    label: 'Favicon URL (browser tab icon)', placeholder: 'https://…/favicon.ico', type: 'url' },
                { key: 'support_email',  label: 'Support Email (printed on receipts)', placeholder: 'support@client.com', type: 'email' },
                { key: 'support_phone',  label: 'Support Phone (printed on receipts)', placeholder: '+263…', type: 'text' },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-slate-400">{label}</label>
                  <input
                    type={type}
                    value={whitelabel[key] || ''}
                    onChange={(e) => setWL(key, e.target.value)}
                    placeholder={placeholder}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              ))}

              {/* Industry vertical — filtering today, per-vertical presets later */}
              <div>
                <label className="text-xs font-semibold text-slate-400">Industry / Business Type</label>
                <select
                  value={whitelabel.industry || ''}
                  onChange={(e) => setWL('industry', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none [&>option]:text-slate-900"
                >
                  <option value="">Not set</option>
                  {INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                </select>
              </div>

              {/* Brand colours — picker + hex, side by side */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'primary_color',   label: 'Primary Colour (themes the whole portal)' },
                  { key: 'secondary_color', label: 'Accent Colour' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs font-semibold text-slate-400">{label}</label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(whitelabel[key] || '') ? whitelabel[key] : '#2563eb'}
                        onChange={(e) => setWL(key, e.target.value)}
                        className="h-9 w-10 flex-shrink-0 cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5"
                      />
                      <input
                        type="text"
                        value={whitelabel[key] || ''}
                        onChange={(e) => setWL(key, e.target.value)}
                        placeholder="#0066CC"
                        className="w-full rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Hide "Powered by" line</p>
                  <p className="text-xs text-slate-500">Receipts show only the client's brand — no powered-by mention at all</p>
                </div>
                <Toggle value={!!whitelabel.hide_powered_by} onChange={(v) => setWL('hide_powered_by', v)} />
              </div>

              {/* Live preview: generated palette + how the portal accent will look */}
              {(() => {
                const scale = buildShadeScale(whitelabel.primary_color)
                if (!scale) return null
                return (
                  <div className="space-y-3 rounded-xl border border-white/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Theme preview</p>
                    <div className="flex overflow-hidden rounded-lg border border-white/10">
                      {Object.entries(scale).map(([shade, hex]) => (
                        <div key={shade} className="h-8 flex-1" style={{ backgroundColor: hex }} title={`${shade}: ${hex}`} />
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-xl px-4 py-2 text-sm font-semibold text-white"
                        style={{ backgroundColor: scale['600'] }}
                      >
                        {whitelabel.brand_name || 'Primary button'}
                      </span>
                      <span
                        className="rounded-xl border px-4 py-2 text-sm font-semibold"
                        style={{ borderColor: scale['600'], color: scale['400'] }}
                      >
                        Secondary
                      </span>
                      {whitelabel.secondary_color && (
                        <span className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: whitelabel.secondary_color }}>
                          Accent
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      This palette replaces the blue portal theme everywhere in the client's app the moment you save.
                    </p>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── Backups tab ── */}
          {tab === 'Backups' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-300">
                <HardDrive className="h-4 w-4 flex-shrink-0" />
                Configure automated backup schedules for cloud and local storage.
              </div>

              <div className="divide-y divide-white/5 rounded-xl border border-white/10">
                {BACKUP_OPTIONS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
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
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Retention (days)</label>
                <input
                  type="number"
                  value={backupConfig.retention_days || ''}
                  onChange={(e) => setBackup('retention_days', Number(e.target.value))}
                  placeholder="e.g. 90"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-400 dark:placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* ── Team tab ── */}
          {tab === 'Team' && (
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
                    !technicianId ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20'
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-400">—</span>
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
                            : 'border-slate-200 hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-bold text-indigo-400">
                          {tech.name?.[0] || '?'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{tech.name}</p>
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
          {isPending || isStalled ? (
            <>
              <button
                onClick={() => save('active')}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-slate-900 dark:text-white hover:bg-green-700 disabled:opacity-60"
              >
                <CheckCircle className="h-4 w-4" />
                {saving ? 'Saving…' : `Approve & Activate — ${PLANS[planType]?.label}`}
              </button>
              <div className="flex gap-2">
                {isPending && (
                  <button
                    onClick={() => { setDecisionAction('stall'); setDecisionReason('') }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-600/10 py-2.5 text-sm font-semibold text-orange-400 hover:bg-orange-600/20"
                  >
                    <PauseCircle className="h-4 w-4" />
                    Put On Hold
                  </button>
                )}
                <button
                  onClick={() => { setDecisionAction('reject'); setDecisionReason('') }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600/10 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-600/20"
                >
                  <Ban className="h-4 w-4" />
                  Reject
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => save(null)}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-slate-900 dark:text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}

          {tenant.status === 'active' && (
            <button
              onClick={viewAsTenant}
              disabled={impersonating}
              title="Signs you in as this business's owner — full rights, for support and operations"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 py-2.5 text-sm font-semibold text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-60"
            >
              <Eye className="h-4 w-4" />
              {impersonating ? 'Opening…' : 'View as Tenant'}
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
          {tenant.status === 'rejected' && (
            <button
              onClick={() => save('pending')}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600/10 py-2.5 text-sm font-semibold text-indigo-400 hover:bg-indigo-600/20 disabled:opacity-60"
            >
              <Clock className="h-4 w-4" />
              Reopen for Review
            </button>
          )}

          {/* Danger zone — Super Admin only */}
          {isSuperAdminUser && tenant.status !== 'deleted' && (
            <div className="mt-1 flex gap-2 border-t border-white/10 pt-3">
              <button
                onClick={() => { setDangerAction('terminate'); setDangerInput('') }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600/10 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-600/20"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Terminate Tenant
              </button>
              <button
                onClick={() => { setDangerAction('delete'); setDangerInput('') }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600/10 py-2 text-xs font-semibold text-red-400 hover:bg-red-600/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Permanently
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Danger action confirmation */}
      {dangerAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={() => !dangerBusy && setDangerAction(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-5 shadow-2xl dark:bg-slate-900"
          >
            {dangerAction === 'terminate' ? (
              <>
                <h3 className="mb-1 font-bold text-slate-900 dark:text-white">Terminate {tenant.name}</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Ends access and moves this tenant to the Deleted log. Data is kept, not erased. Requires a reason.
                </p>
                <textarea
                  value={dangerInput}
                  onChange={(e) => setDangerInput(e.target.value)}
                  placeholder="Reason for termination…"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </>
            ) : (
              <>
                <h3 className="mb-1 font-bold text-slate-900 dark:text-white">Permanently delete {tenant.name}</h3>
                <p className="mb-3 text-xs text-red-400">
                  This erases the tenant and every product, order, transaction, and staff account tied to it — it cannot be undone.
                  Type <b>{tenant.name}</b> to confirm.
                </p>
                <input
                  value={dangerInput}
                  onChange={(e) => setDangerInput(e.target.value)}
                  placeholder={tenant.name}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-red-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                />
              </>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDangerAction(null)}
                disabled={dangerBusy}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={dangerAction === 'terminate' ? terminateTenant : deleteTenantPermanently}
                disabled={dangerBusy}
                className={`flex-1 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-60 ${
                  dangerAction === 'terminate' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {dangerBusy ? 'Working…' : dangerAction === 'terminate' ? 'Terminate' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject / Stall confirmation */}
      {decisionAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={() => !decisionBusy && setDecisionAction(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-5 shadow-2xl dark:bg-slate-900"
          >
            <h3 className="mb-1 font-bold text-slate-900 dark:text-white">
              {decisionAction === 'reject' ? `Reject ${tenant.name}` : `Put ${tenant.name} on hold`}
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              {decisionAction === 'reject'
                ? 'The applicant sees this reason and can no longer sign in.'
                : 'The applicant sees this reason and can request another review at any time.'}
            </p>
            <textarea
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              placeholder="Reason…"
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDecisionAction(null)}
                disabled={decisionBusy}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={async () => { await decideApplication(decisionAction); setDecisionAction(null) }}
                disabled={decisionBusy}
                className={`flex-1 rounded-xl py-2 text-sm font-bold text-white disabled:opacity-60 ${
                  decisionAction === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {decisionBusy ? 'Working…' : decisionAction === 'reject' ? 'Reject' : 'Put On Hold'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Create Tenant (Super Admin direct creation) ───────────────────────────────
// For businesses onboarded over the phone/WhatsApp, or any case where a
// tenant shouldn't have to go through the public /register + approval flow.
// Creates the tenant, the vendor's auth account, and the main branch as one
// atomic unit (see supabase/functions/admin-create-tenant) — status is
// 'active' immediately since the Super Admin creating it directly is itself
// the approval.
function CreateTenantModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    businessName: '', ownerName: '', email: '', password: '', phone: '',
    posMode: 'retail', planType: 'standard_plan', currency: 'USD',
  })
  const [creating, setCreating] = useState(false)
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setCreating(true)
    try {
      const data = await invokeEdgeFunction('admin-create-tenant', {
        businessName: form.businessName.trim(),
        ownerName: form.ownerName.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || null,
        posMode: form.posMode,
        planType: form.planType,
        features: DEFAULT_FEATURES[form.planType] || {},
        currency: form.currency,
      })
      toast.success(`${form.businessName} created — ${form.ownerName} can sign in now`)
      onCreated(data)
    } catch (err) {
      toast.error(err.message || 'Failed to create tenant')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-slate-900" style={{ maxHeight: '90vh' }}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 p-5">
          <div>
            <p className="font-bold text-slate-900 dark:text-white">Create Tenant</p>
            <p className="text-xs text-slate-500">Sets up the business and its owner account immediately — no approval step needed.</p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Business Name *</label>
            <input
              value={form.businessName}
              onChange={(e) => set('businessName', e.target.value)}
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Business Type</label>
              <select
                value={form.posMode}
                onChange={(e) => set('posMode', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {BUSINESS_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Plan</label>
              <select
                value={form.planType}
                onChange={(e) => set('planType', e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {Object.entries(PLANS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
            <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Business Owner (Vendor)</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name *</label>
                <input
                  value={form.ownerName}
                  onChange={(e) => set('ownerName', e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Password *</label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) => set('password', e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create Tenant'}
            </button>
          </div>
        </form>
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
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const canManage = role === 'super_admin' || role === 'admin'
  const isSuperAdmin = role === 'super_admin'

  const load = async () => {
    setLoading(true)
    const [{ data: tenantData }, { data: techData }, { data: ownerData }] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at', { ascending: false }),
      supabase.from('app_users').select('id, name, email').eq('role', 'tech_support').eq('is_active', true),
      supabase.from('users').select('tenant_id, name, email, phone').eq('role', 'vendor'),
    ])
    const ownerByTenant = Object.fromEntries((ownerData || []).map((o) => [o.tenant_id, o]))
    setTenants((tenantData || []).map((t) => ({ ...t, owner: ownerByTenant[t.id] || null })))
    setTechnicians(techData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const byTab = {
    all:       tenants.filter((t) => t.status !== 'deleted'),
    active:    tenants.filter((t) => t.status === 'active'),
    pending:   tenants.filter((t) => t.status === 'pending'),
    stalled:   tenants.filter((t) => t.status === 'stalled'),
    suspended: tenants.filter((t) => t.status === 'suspended'),
    rejected:  tenants.filter((t) => t.status === 'rejected'),
    deleted:   tenants.filter((t) => t.status === 'deleted'),
  }
  const counts = {
    all: byTab.all.length, active: byTab.active.length, pending: byTab.pending.length,
    stalled: byTab.stalled.length, suspended: byTab.suspended.length,
    rejected: byTab.rejected.length, deleted: byTab.deleted.length,
  }

  const filtered = (byTab[tab] || []).filter((t) => {
    const q = search.toLowerCase()
    return t.name?.toLowerCase().includes(q) || t.slug?.toLowerCase().includes(q)
      || t.owner?.email?.toLowerCase().includes(q) || t.owner?.phone?.toLowerCase().includes(q)
  })

  const tabs = [
    { id: 'all',       label: 'All' },
    { id: 'active',    label: 'Active' },
    { id: 'pending',   label: 'Pending',   urgent: true },
    { id: 'stalled',   label: 'Stalled',   urgent: true },
    { id: 'suspended', label: 'Suspended' },
    { id: 'rejected',  label: 'Rejected' },
    { id: 'deleted',   label: 'Deleted' },
  ]

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Tenants</h1>
          <p className="mt-1 text-sm text-slate-400">{tenants.length} registered businesses</p>
        </div>
        <div className="flex flex-1 items-center gap-3 sm:flex-none">
          <div className="relative max-w-xs flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tenants…"
              className="w-full rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          {isSuperAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              <Building2 className="h-4 w-4" /> Create Tenant
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 p-1">
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
      ) : tab === 'deleted' ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Activated</th>
                <th className="px-4 py-3">Suspended</th>
                <th className="px-4 py-3">Terminated</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.map((tenant) => {
                const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZW', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
                return (
                  <tr key={tenant.id} className="text-slate-700 dark:text-slate-300">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{tenant.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{tenant.slug}</td>
                    <td className="px-4 py-3">{fmt(tenant.created_at)}</td>
                    <td className="px-4 py-3">{fmt(tenant.approved_at || tenant.plan_start_date)}</td>
                    <td className="px-4 py-3">{fmt(tenant.suspended_at)}</td>
                    <td className="px-4 py-3">{fmt(tenant.terminated_at)}</td>
                    <td className="px-4 py-3 max-w-xs truncate" title={tenant.termination_reason || ''}>{tenant.termination_reason || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
                className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${i < filtered.length - 1 ? 'border-b border-slate-100 dark:border-white/5' : ''}`}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-lg font-extrabold text-indigo-400">
                  {tenant.name?.[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{tenant.name}</span>
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
                  {tenant.owner && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {tenant.owner.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{tenant.owner.email}</span>}
                      {tenant.owner.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{tenant.owner.phone}</span>}
                    </div>
                  )}
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

      {showCreate && (
        <CreateTenantModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}
