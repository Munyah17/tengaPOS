import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, RefreshCw, ToggleLeft, ToggleRight, Eye, EyeOff, X, Loader2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import ExportMenu from '@/components/common/ExportMenu'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchStaff, updateStaffStatus } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

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
  const { tenant } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' })
  const [showPassword, setShowPassword] = useState(false)
  const [creating, setCreating] = useState(false)

  const loadStaff = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchStaff(tenant.id)
      .then(setStaff)
      .catch((err) => toast.error(err.message || 'Failed to load staff'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadStaff() }, [tenant?.id])

  const toggleActive = async (member) => {
    const next = !member.is_active
    setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: next } : s))
    await updateStaffStatus(member.id, next).catch(err => {
      toast.error(err.message || 'Failed to update')
      setStaff(prev => prev.map(s => s.id === member.id ? { ...s, is_active: member.is_active } : s))
    })
  }

  const handleAddStaff = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('tenant-add-staff', {
        body: form,
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
      toast.success(`${form.name} can now sign in as ${roleLabels[form.role]}`)
      setForm({ name: '', email: '', password: '', role: 'cashier' })
      setShowAdd(false)
      loadStaff()
    } catch (err) {
      toast.error(err.message || 'Failed to add staff member')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Staff Management</h1>
          <p className="text-sm text-slate-500">Add and manage your team — accounts are created instantly, no invitations</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadStaff} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <ExportMenu data={staff} columns={exportColumns} title="Staff" filename="tengapos_staff" />
          <Button variant={isRestaurant ? 'restaurant' : 'primary'} onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add Staff
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
                  {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center text-sm text-slate-400">No staff yet — add your first team member.</td></tr>
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
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${member.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {member.role !== 'vendor' && (
                        <button
                          onClick={() => toggleActive(member)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          title={member.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {member.is_active
                            ? <ToggleRight className="h-5 w-5 text-green-500" />
                            : <ToggleLeft className="h-5 w-5" />}
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Staff Modal — creates a real account instantly, no invitation */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Staff Member">
        <form onSubmit={handleAddStaff} className="space-y-4">
          <p className="text-sm text-slate-500">
            The account is created instantly with the password you set — share the credentials with your staff member.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
              placeholder="e.g. Rudo Chirwa"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
              placeholder="staff@example.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
                minLength={8}
                placeholder="Min 8 characters"
              />
              <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {Object.entries(roleLabels).filter(([k]) => ['shop_manager', 'supervisor', 'cashier', 'shop_assistant'].includes(k)).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? 'Creating…' : 'Add Staff'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
