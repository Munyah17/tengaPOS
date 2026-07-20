import { useEffect, useState } from 'react'
import {
  Users, Search, Plus, X, KeyRound, Trash2, Ban, CheckCircle,
  Pencil, Building2, Eye, EyeOff, Loader2, LockKeyholeOpen, LogOut,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

const TENANT_ROLES = [
  { key: 'vendor', label: 'Vendor (Owner)' },
  { key: 'shop_manager', label: 'Shop Manager' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'cashier', label: 'Cashier' },
  { key: 'shop_assistant', label: 'Shop Assistant' },
]

const ROLE_BADGE = {
  vendor:         'bg-green-500/15 text-green-500',
  shop_manager:   'bg-blue-500/15 text-blue-500',
  supervisor:     'bg-purple-500/15 text-purple-500',
  cashier:        'bg-teal-500/15 text-teal-500',
  shop_assistant: 'bg-slate-500/15 text-slate-500',
}

async function invokeManageUser(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body,
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })
  if (error) {
    let msg = error.message
    try {
      const ctx = await error.context?.json()
      if (ctx?.error) msg = ctx.error
    } catch { /* keep default */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

function FieldInput({ label, ...props }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-500">{label}</label>
      <input
        {...props}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
      />
    </div>
  )
}

function CreateUserModal({ tenants, onClose, onDone }) {
  const [form, setForm] = useState({ tenant_id: '', name: '', email: '', password: '', role: 'cashier' })
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.tenant_id) { toast.error('Choose the business this user belongs to'); return }
    setSaving(true)
    try {
      await invokeManageUser({ action: 'create', ...form })
      toast.success(`${form.name} can now sign in`)
      onDone()
    } catch (err) {
      toast.error(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-white">Create Client User</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Business (Tenant)</label>
            <select
              value={form.tenant_id}
              onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value }))}
              required
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              <option value="">— Select business —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <FieldInput label="Full Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="e.g. Rudo Chirwa" />
          <FieldInput label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required placeholder="user@business.co.zw" />
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={8}
                placeholder="Min 8 characters"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
              <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              {TENANT_ROLES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? 'Creating…' : 'Create User'}
        </button>
      </form>
    </div>
  )
}

function EditUserModal({ user, tenants, onClose, onDone }) {
  const { role: myRole } = useAuthStore()
  const isSuper = myRole === 'super_admin'
  const [form, setForm] = useState({
    name: user.name || '',
    username: user.username || '',
    email: user.email || '',
    phone: user.phone || '',
    role: user.role,
    tenant_id: user.tenant_id,
    branch_id: user.branch_id || '',
    is_active: user.is_active !== false,
  })
  const [branches, setBranches] = useState([])
  const [authInfo, setAuthInfo] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const setF = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  // Branch options follow the selected business (matters when moving tenants)
  useEffect(() => {
    supabase.from('branches').select('id, name').eq('tenant_id', form.tenant_id)
      .then(({ data }) => setBranches(data || []))
  }, [form.tenant_id])

  // Auth-level detail (last sign-in, ban state, providers) via service role
  useEffect(() => {
    invokeManageUser({ action: 'get_auth_info', user_id: user.id })
      .then((res) => setAuthInfo(res.auth))
      .catch(() => {})
  }, [user.id])

  const isBanned = authInfo?.banned_until && new Date(authInfo.banned_until) > new Date()

  const runAction = async (fn, doneMsg, { confirm } = {}) => {
    if (confirm && !window.confirm(confirm)) return
    setSaving(true)
    try {
      await fn()
      toast.success(doneMsg)
      onDone()
    } catch (err) {
      toast.error(err.message)
      setSaving(false)
    }
  }

  const save = (e) => {
    e.preventDefault()
    runAction(async () => {
      await invokeManageUser({
        action: 'update_user',
        user_id: user.id,
        name: form.name.trim(),
        username: form.username.trim() || null,
        phone: form.phone.trim() || null,
        role: form.role,
        branch_id: form.branch_id || null,
        is_active: form.is_active,
        // Email/tenant moves are Super Admin powers — only send when changed
        // so Admin saves don't trip the server-side permission check.
        ...(isSuper && form.email.trim() !== user.email ? { email: form.email.trim() } : {}),
        ...(isSuper && form.tenant_id !== user.tenant_id ? { tenant_id: form.tenant_id } : {}),
      })
      if (newPassword) {
        await invokeManageUser({ action: 'reset_password', user_id: user.id, new_password: newPassword })
      }
    }, 'User updated')
  }

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-slate-800 dark:text-white'
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <form onSubmit={save} className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Edit User</h2>
            <p className="text-xs text-slate-500">{user.email} · {user.tenants?.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Account activity — service-role auth data */}
        <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-white/10 dark:bg-white/5 sm:grid-cols-3">
          <div><span className="block text-slate-400">Last sign-in</span><span className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(authInfo?.last_sign_in_at)}</span></div>
          <div><span className="block text-slate-400">Created</span><span className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(authInfo?.created_at)}</span></div>
          <div>
            <span className="block text-slate-400">Status</span>
            <span className={`font-semibold ${isBanned ? 'text-red-500' : form.is_active ? 'text-green-500' : 'text-amber-500'}`}>
              {isBanned ? 'Banned' : form.is_active ? 'Active' : 'Suspended'}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FieldInput label="Full Name" value={form.name} onChange={(e) => setF('name', e.target.value)} required />
          <FieldInput label="Username" value={form.username} onChange={(e) => setF('username', e.target.value)} placeholder="Optional" />
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Email {!isSuper && '(Super Admin only)'}</label>
            <input type="email" value={form.email} onChange={(e) => setF('email', e.target.value)} disabled={!isSuper} className={inputClass} />
          </div>
          <FieldInput label="Phone" value={form.phone} onChange={(e) => setF('phone', e.target.value)} placeholder="+263…" />
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Role</label>
            <select value={form.role} onChange={(e) => setF('role', e.target.value)} className={inputClass}>
              {TENANT_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Business {!isSuper && '(Super Admin only)'}</label>
            <select value={form.tenant_id} onChange={(e) => { setF('tenant_id', e.target.value); setF('branch_id', '') }} disabled={!isSuper} className={inputClass}>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Branch</label>
            <select value={form.branch_id} onChange={(e) => setF('branch_id', e.target.value)} className={inputClass}>
              <option value="">No branch assigned</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setF('is_active', e.target.checked)} className="h-4 w-4 rounded" />
              Account active
            </label>
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <KeyRound className="h-3 w-3" /> Reset Password (leave blank to keep current)
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              placeholder="New password (min 8 chars)"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
            />
            <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </button>

        {isSuper && (
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-white/10">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Super Admin Controls</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => runAction(
                  () => invokeManageUser({ action: 'force_logout', user_id: user.id }),
                  'All sessions revoked — user signed out everywhere',
                )}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                <LogOut className="h-3.5 w-3.5" /> Force Logout Everywhere
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => runAction(
                  () => invokeManageUser({ action: isBanned ? 'unban' : 'ban', user_id: user.id }),
                  isBanned ? 'Ban lifted' : 'User banned — sign-in blocked',
                  { confirm: isBanned ? null : `Ban ${user.name || user.email}? They will be blocked from signing in until unbanned.` },
                )}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold disabled:opacity-60 ${
                  isBanned
                    ? 'bg-green-600/10 text-green-500 hover:bg-green-600/20'
                    : 'bg-amber-600/10 text-amber-500 hover:bg-amber-600/20'
                }`}
              >
                <Ban className="h-3.5 w-3.5" /> {isBanned ? 'Lift Ban' : 'Ban Account'}
              </button>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => runAction(
                () => invokeManageUser({ action: 'delete', user_id: user.id }),
                'Account deleted',
                { confirm: `Permanently delete ${user.name || user.email}? This cannot be undone.` },
              )}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/10 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-600/20 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Delete Account Permanently
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

export default function AdminUsers() {
  const { user: me, role: myRole } = useAuthStore()
  const isSuperAdmin = myRole === 'super_admin'
  const [users, setUsers] = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = async () => {
    const [{ data: userData }, { data: tenantData }] = await Promise.all([
      supabase.from('users').select('*, tenants(name, status)').order('created_at', { ascending: false }),
      supabase.from('tenants').select('id, name').order('name'),
    ])
    setUsers(userData || [])
    setTenants(tenantData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleActive = async (user) => {
    const { error } = await supabase
      .from('users')
      .update({ is_active: !user.is_active })
      .eq('id', user.id)
    if (error) {
      toast.error(error.message)
    } else {
      await supabase.from('audit_logs').insert({
        actor_id: me?.id,
        actor_email: me?.email,
        action: user.is_active ? 'client_user_suspended' : 'client_user_reinstated',
        target_type: 'user',
        target_id: user.id,
        details: { email: user.email, tenant: user.tenants?.name },
      })
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_active: !user.is_active } : u))
      toast.success(user.is_active ? `${user.name || user.email} suspended` : `${user.name || user.email} reinstated`)
    }
  }

  const unlockUser = async (user) => {
    // Enforced server-side too (a DB trigger blocks is_locked true->false
    // unless the caller is genuinely Super Admin) — this button is just the UI.
    const { error } = await supabase
      .from('users')
      .update({ is_locked: false, locked_reason: null, locked_at: null })
      .eq('id', user.id)
    if (error) {
      toast.error(error.message)
      return
    }
    await supabase.from('audit_logs').insert({
      actor_id: me?.id,
      actor_email: me?.email,
      action: 'client_user_unlocked',
      target_type: 'user',
      target_id: user.id,
      details: { email: user.email, tenant: user.tenants?.name, previous_reason: user.locked_reason },
    })
    setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_locked: false, locked_reason: null, locked_at: null } : u))
    toast.success(`${user.name || user.email} unlocked`)
  }

  const filtered = users.filter((u) => {
    if (tenantFilter && u.tenant_id !== tenantFilter) return false
    const q = search.toLowerCase()
    return !q
      || u.name?.toLowerCase().includes(q)
      || u.email?.toLowerCase().includes(q)
      || u.tenants?.name?.toLowerCase().includes(q)
  })

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">User Management</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {users.length} client account{users.length !== 1 ? 's' : ''} across {tenants.length} businesses
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Create User
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or business…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-500 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </div>
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
        >
          <option value="">All businesses</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <Users className="h-8 w-8 opacity-30" />
          <span className="text-sm">No users match</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
          {filtered.map((user, i) => (
            <div
              key={user.id}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 sm:px-5 sm:py-4 ${
                i < filtered.length - 1 ? 'border-b border-slate-100 dark:border-white/5' : ''
              } ${!user.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-bold text-indigo-400">
                {(user.name || user.email || '?')[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">{user.name || user.email}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${ROLE_BADGE[user.role] || ROLE_BADGE.shop_assistant}`}>
                    {user.role?.replace('_', ' ')}
                  </span>
                  {!user.is_active && (
                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-500">Suspended</span>
                  )}
                  {user.is_locked && (
                    <span
                      className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-500"
                      title={user.locked_reason || 'Locked'}
                    >
                      Locked
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span className="truncate">{user.email}</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {user.tenants?.name || '—'}
                  </span>
                  {user.is_locked && user.locked_reason && (
                    <span className="truncate text-amber-500">{user.locked_reason}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                {user.is_locked && isSuperAdmin && (
                  <button
                    onClick={() => unlockUser(user)}
                    title="Unlock account (Super Admin only)"
                    className="rounded-lg p-2 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                  >
                    <LockKeyholeOpen className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => setEditing(user)}
                  title="Edit user"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => toggleActive(user)}
                  title={user.is_active ? 'Suspend user' : 'Reinstate user'}
                  className={`rounded-lg p-2 ${
                    user.is_active
                      ? 'text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40'
                      : 'text-green-500 hover:bg-green-50 dark:hover:bg-green-950/40'
                  }`}
                >
                  {user.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          tenants={tenants}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); load() }}
        />
      )}
      {editing && (
        <EditUserModal
          user={editing}
          tenants={tenants}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
