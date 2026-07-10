import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import ExportMenu from '@/components/common/ExportMenu'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchStaff, updateStaffStatus } from '@/lib/db'
import toast from 'react-hot-toast'

const INITIAL_STAFF = [
  { id: 1, name: 'Tatenda Moyo', email: 'tatenda@demo.com', role: 'shop_manager', branches: { name: 'Main Branch' }, is_active: true },
  { id: 2, name: 'Grace Kamau', email: 'grace@demo.com', role: 'cashier', branches: { name: 'Main Branch' }, is_active: true },
  { id: 3, name: 'Farai Ncube', email: 'farai@demo.com', role: 'supervisor', branches: { name: 'CBD Branch' }, is_active: true },
  { id: 4, name: 'Chipo Banda', email: 'chipo@demo.com', role: 'cashier', branches: { name: 'Mall Branch' }, is_active: false },
  { id: 5, name: 'Tendai Mawere', email: 'tendai@demo.com', role: 'shop_assistant', branches: { name: 'Main Branch' }, is_active: true },
]

const roleLabels = {
  vendor: 'Vendor', shop_manager: 'Shop Manager', supervisor: 'Supervisor',
  cashier: 'Cashier', shop_assistant: 'Shop Assistant', tech_support: 'Tech Support',
}

const roleColors = {
  vendor: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  shop_manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  supervisor: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  cashier: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  shop_assistant: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  tech_support: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
}

const exportColumns = [
  { header: 'Name', key: 'name' },
  { header: 'Email', key: 'email' },
  { header: 'Role', key: 'role' },
  { header: 'Status', key: 'is_active' },
]

export default function Staff() {
  const { posMode } = useThemeStore()
  const { isDemo, tenant } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const [staff, setStaff] = useState(isDemo ? INITIAL_STAFF : [])
  const [loading, setLoading] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('cashier')
  const [inviting, setInviting] = useState(false)

  const loadStaff = () => {
    if (isDemo || !tenant?.id) return
    setLoading(true)
    fetchStaff(tenant.id)
      .then(setStaff)
      .catch(() => toast.error('Failed to load staff'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadStaff() }, [isDemo, tenant?.id])

  const toggleActive = async (member) => {
    if (isDemo) {
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: !s.is_active } : s))
      return
    }
    const next = !member.is_active
    setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: next } : s))
    await updateStaffStatus(member.id, next).catch(err => {
      toast.error(err.message || 'Failed to update')
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: member.is_active } : s))
    })
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    if (isDemo) {
      toast('Invite sent! (demo mode — no real email sent)')
      setShowInvite(false)
      return
    }
    setInviting(true)
    try {
      const { supabase } = await import('@/lib/supabase')
      const { error } = await supabase.from('staff_invites').insert({
        tenant_id: tenant.id,
        email: inviteEmail,
        role: inviteRole,
      })
      if (error) throw error
      toast.success('Invite recorded — staff member can sign up with this email')
      setShowInvite(false)
      setInviteEmail('')
    } catch (err) {
      toast.error(err.message || 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Staff Management</h1>
          <p className="text-sm text-slate-500">Manage employees and roles</p>
        </div>
        <div className="flex gap-2">
          {!isDemo && (
            <button onClick={loadStaff} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <ExportMenu data={staff} columns={exportColumns} title="Staff" filename="tengapos_staff" />
          <Button variant={isRestaurant ? 'restaurant' : 'primary'} onClick={() => setShowInvite(true)}>
            <Plus className="h-4 w-4" /> Invite Staff
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading staff…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Name', 'Email', 'Role', 'Branch', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">No staff yet — invite your first team member.</td></tr>
                ) : staff.map(member => (
                  <motion.tr
                    key={member.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                          {member.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{member.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{member.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColors[member.role] || roleColors.cashier}`}>
                        {roleLabels[member.role] || member.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {member.branches?.name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${member.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(member)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                        title={member.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {member.is_active
                          ? <ToggleRight className="h-5 w-5 text-green-500" />
                          : <ToggleLeft className="h-5 w-5" />}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      <Modal isOpen={showInvite} onClose={() => setShowInvite(false)} title="Invite Staff Member">
        <form onSubmit={handleInvite} className="space-y-4">
          <p className="text-sm text-slate-500">
            Enter the email address of the new staff member. They will sign up at www.tengapos.co.zw/register with this email and be linked to your account.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
              placeholder="staff@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {Object.entries(roleLabels).filter(([k]) => k !== 'vendor').map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button type="submit" disabled={inviting}>{inviting ? 'Sending…' : 'Send Invite'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
