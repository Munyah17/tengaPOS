import { useState, useEffect } from 'react'
import { UserPlus, Mail, ShieldCheck, Trash2, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

const ROLE_BADGE = {
  super_admin: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Super Admin' },
  admin: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', label: 'Admin' },
  tech_support: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Tech Support' },
}

export default function AdminStaff() {
  const { role: myRole, profile: myProfile } = useAuthStore()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' })
  const [showPassword, setShowPassword] = useState(false)
  const [creating, setCreating] = useState(false)
  const isSuperAdmin = myRole === 'super_admin'

  async function load() {
    const { data, error } = await supabase.from('app_users').select('*').order('created_at')
    if (!error) setStaff(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) return
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('create-staff', {
        body: form,
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error) {
        // supabase-js wraps non-2xx responses; surface the real message
        let msg = error.message
        try {
          const ctx = await error.context?.json()
          if (ctx?.error) msg = ctx.error
        } catch { /* keep default */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      toast.success(`${form.name} can now sign in as ${ROLE_BADGE[form.role]?.label}`)
      setForm({ name: '', email: '', password: '', role: 'admin' })
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to create account')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeactivate(member) {
    const { error } = await supabase
      .from('app_users')
      .update({ is_active: !member.is_active })
      .eq('id', member.id)
    if (error) {
      toast.error(error.message)
    } else {
      setStaff((prev) => prev.map((m) => m.id === member.id ? { ...m, is_active: !member.is_active } : m))
      toast.success(member.is_active ? `${member.name} deactivated` : `${member.name} reactivated`)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Staff Management</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Platform staff — Admins and Tech Support. Only the Super Admin creates accounts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Staff list */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
              {staff.map((member, i) => {
                const badge = ROLE_BADGE[member.role] || ROLE_BADGE.tech_support
                const isSelf = member.email === myProfile?.email
                const canManage = isSuperAdmin && member.role !== 'super_admin' && !isSelf
                return (
                  <div
                    key={member.id}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${
                      i < staff.length - 1 ? 'border-b border-slate-100 dark:border-white/5' : ''
                    } ${!member.is_active ? 'opacity-50' : ''}`}
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-bold text-indigo-400">
                      {member.name?.[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{member.name}</span>
                        {isSelf && <span className="text-xs text-slate-500">(you)</span>}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                        {!member.is_active && (
                          <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-xs font-semibold text-slate-500">Deactivated</span>
                        )}
                        {member.role === 'super_admin' && (
                          <ShieldCheck className="h-3.5 w-3.5 text-red-500" title="Protected account" />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Mail className="h-3 w-3" />
                        {member.email}
                      </div>
                    </div>
                    {canManage && (
                      <button
                        onClick={() => handleDeactivate(member)}
                        className="flex-shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        title={member.is_active ? 'Deactivate account' : 'Reactivate account'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Create account — Super Admin only, no invitations */}
        {isSuperAdmin && (
          <div className="h-fit rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <UserPlus className="h-4 w-4 text-indigo-400" />
              Create Staff Account
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              The account is created instantly with the password you set — share the credentials securely.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Tinashe Dube"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Email Address</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="staff@tengapos.co.zw"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 characters"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-500">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-slate-900 dark:text-white"
                >
                  <option value="admin">Admin (operations staff)</option>
                  <option value="tech_support">Tech Support</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {creating ? 'Creating…' : 'Create Account'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
