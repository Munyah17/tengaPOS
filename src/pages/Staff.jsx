import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, RefreshCw, ToggleLeft, ToggleRight, Eye, EyeOff, X, Loader2, Pencil, Building2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import ExportMenu from '@/components/common/ExportMenu'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import {
  fetchStaff, updateStaffStatus, fetchBranches, updateStaffUsername, updateStaffEmployeeNo,
  fetchUserBranches, assignUserBranch, unassignUserBranch,
} from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import { supabase } from '@/lib/supabase'
import ShiftRoster from '@/components/staff/ShiftRoster'
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
  const { tenant, role, branch: homeBranch, user } = useAuthStore()
  const isShopManager = role === 'shop_manager'
  const isRestaurant = posMode === 'restaurant'
  const [staff, setStaff] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', branch_id: '', username: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [creating, setCreating] = useState(false)
  const [usernameEdit, setUsernameEdit] = useState(null) // { id, name, username, employee_no } while editing
  const [savingUsername, setSavingUsername] = useState(false)
  const [branchesEdit, setBranchesEdit] = useState(null) // { id, name, homeBranchId, extraIds } while editing
  const [savingBranches, setSavingBranches] = useState(false)

  const loadStaff = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(['staff', tenant.id], () => fetchStaff(tenant.id), {
      onData: setStaff,
      onError: (err) => toast.error(err.message || 'Failed to load staff'),
      onLoadingChange: setLoading,
    })
  }

  useEffect(() => { loadStaff() }, [tenant?.id])

  // "Refresh Online Updates" button — forces this page to reload from the
  // network right now instead of waiting on its own cache.
  useEffect(() => {
    window.addEventListener('tengapos:force-refresh', loadStaff)
    return () => window.removeEventListener('tengapos:force-refresh', loadStaff)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  useEffect(() => {
    if (!tenant?.id) return
    fetchBranches(tenant.id).then((rows) => {
      setBranches(rows)
      const main = rows.find((b) => b.is_main) || rows[0]
      if (main) setForm((f) => ({ ...f, branch_id: f.branch_id || main.id }))
    }).catch(() => toast.error("Couldn't load branches"))
  }, [tenant?.id])

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
      setForm((f) => ({ name: '', email: '', password: '', role: 'cashier', branch_id: f.branch_id, username: '' }))
      setShowAdd(false)
      loadStaff()
    } catch (err) {
      toast.error(err.message || 'Failed to add staff member')
    } finally {
      setCreating(false)
    }
  }

  const handleSaveUsername = async (e) => {
    e.preventDefault()
    setSavingUsername(true)
    try {
      const clean = usernameEdit.username.trim().toLowerCase()
      const cleanEmployeeNo = usernameEdit.employee_no.trim()
      await Promise.all([
        updateStaffUsername(usernameEdit.id, clean || null),
        updateStaffEmployeeNo(usernameEdit.id, cleanEmployeeNo || null),
      ])
      setStaff((prev) => prev.map((s) => s.id === usernameEdit.id ? { ...s, username: clean || null, employee_no: cleanEmployeeNo || null } : s))
      toast.success('Details saved')
      setUsernameEdit(null)
    } catch (err) {
      toast.error(err.message?.includes('duplicate') || err.code === '23505' ? 'That username is already taken' : (err.message || 'Failed to save details'))
    } finally {
      setSavingUsername(false)
    }
  }

  const openBranchesEdit = async (member) => {
    let extraIds = []
    try {
      extraIds = await fetchUserBranches(member.id)
    } catch { /* non-fatal — starts with none pre-selected */ }
    setBranchesEdit({ id: member.id, name: member.name, homeBranchId: member.branch_id, extraIds })
  }

  const toggleExtraBranch = async (branchId) => {
    if (!branchesEdit || branchId === branchesEdit.homeBranchId) return
    const has = branchesEdit.extraIds.includes(branchId)
    setSavingBranches(true)
    try {
      if (has) {
        await unassignUserBranch(branchesEdit.id, branchId)
        setBranchesEdit((b) => ({ ...b, extraIds: b.extraIds.filter((id) => id !== branchId) }))
      } else {
        await assignUserBranch(branchesEdit.id, branchId)
        setBranchesEdit((b) => ({ ...b, extraIds: [...b.extraIds, branchId] }))
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update branch assignment')
    } finally {
      setSavingBranches(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {isShopManager ? 'Shift Roster' : 'Staff Management'}
          </h1>
          <p className="text-sm text-slate-500">
            {isShopManager
              ? 'Plan working hours and rotations for your branch'
              : 'Add and manage your team — accounts are created instantly, no invitations'}
          </p>
        </div>
        {!isShopManager && (
          <div className="flex gap-2">
            <button onClick={loadStaff} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <ExportMenu data={staff} columns={exportColumns} title="Staff" filename="tengapos_staff" />
            <Button variant={isRestaurant ? 'restaurant' : 'primary'} onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4" /> Add Staff
            </Button>
          </div>
        )}
      </div>

      {isShopManager ? (
        <ShiftRoster tenant={tenant} branch={homeBranch} staffList={staff} userId={user?.id} />
      ) : (
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
                  {['Name', 'Email', 'Username', 'Role', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">No staff yet — add your first team member.</td></tr>
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
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{member.username || '—'}</td>
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
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setUsernameEdit({ id: member.id, name: member.name, username: member.username || '', employee_no: member.employee_no || '' })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          title="Set username / employee number"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {member.role !== 'vendor' && branches.length > 1 && (
                          <button
                            onClick={() => openBranchesEdit(member)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            title="Assign extra branches"
                          >
                            <Building2 className="h-4 w-4" />
                          </button>
                        )}
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
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

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
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Username (optional)</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="e.g. rudo.c — lets them sign in without typing an email"
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
              {Object.entries(roleLabels)
                .filter(([k]) => ['shop_manager', 'supervisor', 'cashier', 'shop_assistant'].includes(k))
                .map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
            </select>
          </div>
          {form.role !== 'vendor' && branches.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Branch</label>
              <select
                value={form.branch_id}
                onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? 'Creating…' : 'Add Staff'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Set/change username + employee number */}
      <Modal isOpen={!!usernameEdit} onClose={() => setUsernameEdit(null)} title={`Details for ${usernameEdit?.name || ''}`}>
        {usernameEdit && (
          <form onSubmit={handleSaveUsername} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Username</label>
              <p className="mb-1.5 text-xs text-slate-500">
                Optional. Lets this person sign in with a username instead of their email — either one works. Leave blank to remove it.
              </p>
              <input
                type="text"
                value={usernameEdit.username}
                onChange={(e) => setUsernameEdit((u) => ({ ...u, username: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="e.g. rudo.c"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Employee Number</label>
              <p className="mb-1.5 text-xs text-slate-500">
                Optional. Lets this person be picked as the Salesperson on a receipt at checkout.
              </p>
              <input
                type="text"
                value={usernameEdit.employee_no}
                onChange={(e) => setUsernameEdit((u) => ({ ...u, employee_no: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="e.g. EMP-014"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setUsernameEdit(null)}>Cancel</Button>
              <Button type="submit" disabled={savingUsername}>
                {savingUsername && <Loader2 className="h-4 w-4 animate-spin" />}
                {savingUsername ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Assign extra branches — beyond their one home branch */}
      <Modal isOpen={!!branchesEdit} onClose={() => setBranchesEdit(null)} title={`Branches for ${branchesEdit?.name || ''}`}>
        {branchesEdit && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Bound to their home branch by default. Check any extra branches they should also have access to.
            </p>
            <div className="space-y-1.5">
              {branches.map((b) => {
                const isHome = b.id === branchesEdit.homeBranchId
                return (
                  <label
                    key={b.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isHome ? 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/50' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isHome || branchesEdit.extraIds.includes(b.id)}
                      disabled={isHome || savingBranches}
                      onChange={() => toggleExtraBranch(b.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                    {b.name} {isHome && <span className="text-xs">(home branch)</span>}
                  </label>
                )
              })}
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={() => setBranchesEdit(null)}>Done</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
