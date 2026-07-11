import { useEffect, useState } from 'react'
import {
  Users, Search, Plus, X, KeyRound, Trash2, Ban, CheckCircle,
  Pencil, Building2, Eye, EyeOff, Loader2,
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

function EditUserModal({ user, onClose, onDone }) {
  const { role: myRole } = useAuthStore()
  const [name, setName] = useState(user.name || '')
  const [userRole, setUserRole] = useState(user.role)
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({ name: name.trim(), role: userRole })
        .eq('id', user.id)
      if (error) throw error
      if (newPassword) {
        await invokeManageUser({ action: 'reset_password', user_id: user.id, new_password: newPassword })
      }
      toast.success('User updated')
      onDone()
    } catch (err) {
      toast.error(err.message)
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Permanently delete ${user.name || user.email}? This cannot be undone.`)) return
    setSaving(true)
    try {
      await invokeManageUser({ action: 'delete', user_id: user.id })
      toast.success('Account deleted')
      onDone()
    } catch (err) {
      toast.error(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <form onSubmit={save} className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Edit User</h2>
            <p className="text-xs text-slate-500">{user.email} · {user.tenants?.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <FieldInput label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Role</label>
            <select
              value={userRole}
              onChange={(e) => setUserRole(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
            >
              {TENANT_ROLES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
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
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Changes
        </button>

        {myRole === 'super_admin' && (
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600/10 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-600/20 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Delete Account Permanently
          </button>
        )}
      </form>
    </div>
  )
}

export default function AdminUsers() {
  const { user: me } = useAuthStore()
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
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span className="truncate">{user.email}</span>
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {user.tenants?.name || '—'}
                  </span>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
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
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
