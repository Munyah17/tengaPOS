import { useState, useEffect } from 'react'
import { Users, Plus, Mail, ShieldCheck, Trash2 } from 'lucide-react'
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
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('tech_support')
  const [inviting, setInviting] = useState(false)
  const isSuperAdmin = myRole === 'super_admin'

  async function load() {
    const { data, error } = await supabase.from('app_users').select('*').order('created_at')
    if (!error) setStaff(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleInvite(e) {
    e.preventDefault()
    if (!inviteEmail) return
    setInviting(true)
    try {
      const { error } = await supabase.from('app_user_invites').insert({
        email: inviteEmail,
        role: inviteRole,
        invited_by: myProfile?.id,
      })
      if (error) throw error
      toast.success(`Invite sent to ${inviteEmail}`)
      setInviteEmail('')
    } catch (err) {
      toast.error(err.message || 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  const canInvite = isSuperAdmin || myRole === 'admin'
  const invitableRoles = isSuperAdmin
    ? ['admin', 'tech_support']
    : ['tech_support']

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Platform Staff</h1>
        <p className="mt-1 text-sm text-slate-400">Manage admins and tech support team members</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Staff list */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              {staff.map((member, i) => {
                const badge = ROLE_BADGE[member.role] || ROLE_BADGE.tech_support
                const isSelf = member.email === myProfile?.email
                const canDelete = isSuperAdmin && member.is_deletable && !isSelf
                return (
                  <div
                    key={member.id}
                    className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/5 ${
                      i < staff.length - 1 ? 'border-b border-white/5' : ''
                    }`}
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-sm font-bold text-indigo-400">
                      {member.name[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{member.name}</span>
                        {isSelf && <span className="text-xs text-slate-500">(you)</span>}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                        {!member.is_deletable && (
                          <ShieldCheck className="h-3.5 w-3.5 text-red-500" title="Protected account" />
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Mail className="h-3 w-3" />
                        {member.email}
                      </div>
                    </div>
                    {canDelete && (
                      <button
                        className="flex-shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-red-950/50 hover:text-red-400"
                        title="Remove staff member"
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

        {/* Invite form */}
        {canInvite && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-white">
              <Plus className="h-4 w-4 text-indigo-400" />
              Invite Staff
            </h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="staff@tengapos.co.zw"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {invitableRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_BADGE[r]?.label || r}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={inviting}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {inviting ? 'Sending…' : 'Send Invite'}
              </button>
            </form>
            <p className="mt-3 text-xs text-slate-500">
              Invites expire after 30 days. The staff member signs up using the invited email.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
