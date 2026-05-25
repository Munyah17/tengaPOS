import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Users, Shield, Edit, Trash2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import ExportMenu from '@/components/common/ExportMenu'
import { useThemeStore } from '@/stores/themeStore'

const initialStaff = [
  { id: 1, name: 'Tatenda Moyo', email: 'tatenda@demo.com', role: 'shop_manager', branch: 'Main Branch', status: 'active' },
  { id: 2, name: 'Grace Kamau', email: 'grace@demo.com', role: 'cashier', branch: 'Main Branch', status: 'active' },
  { id: 3, name: 'Farai Ncube', email: 'farai@demo.com', role: 'supervisor', branch: 'CBD Branch', status: 'active' },
  { id: 4, name: 'Chipo Banda', email: 'chipo@demo.com', role: 'cashier', branch: 'Mall Branch', status: 'inactive' },
  { id: 5, name: 'Tendai Mawere', email: 'tendai@demo.com', role: 'shop_assistant', branch: 'Main Branch', status: 'active' },
]

const roleLabels = {
  vendor: 'Vendor',
  shop_manager: 'Shop Manager',
  supervisor: 'Supervisor',
  cashier: 'Cashier',
  shop_assistant: 'Shop Assistant',
  tech_support: 'Tech Support',
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
  { header: 'Branch', key: 'branch' },
  { header: 'Status', key: 'status' },
]

export default function Staff() {
  const { posMode } = useThemeStore()
  const isRestaurant = posMode === 'restaurant'
  const [staff, setStaff] = useState(initialStaff)
  const [showAdd, setShowAdd] = useState(false)
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'cashier', branch: 'Main Branch' })

  const handleAdd = (e) => {
    e.preventDefault()
    setStaff([...staff, { ...newStaff, id: Date.now(), status: 'active' }])
    setShowAdd(false)
    setNewStaff({ name: '', email: '', role: 'cashier', branch: 'Main Branch' })
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Staff Management</h1>
          <p className="text-sm text-slate-500">Manage employees and roles</p>
        </div>
        <div className="flex gap-2">
          <ExportMenu data={staff} columns={exportColumns} title="Staff" filename="tengapos_staff" />
          <Button variant={isRestaurant ? 'restaurant' : 'primary'} onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add Staff
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
              {['Name', 'Email', 'Role', 'Branch', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <motion.tr
                key={member.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                      {member.name[0]}
                    </div>
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{member.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{member.email}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleColors[member.role]}`}>
                    {roleLabels[member.role]}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{member.branch}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    member.status === 'active'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {member.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setStaff(staff.filter((s) => s.id !== member.id))}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Staff Member">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Full Name</label>
            <input
              type="text"
              value={newStaff.name}
              onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
            <input
              type="email"
              value={newStaff.email}
              onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
            <select
              value={newStaff.role}
              onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Branch</label>
            <select
              value={newStaff.branch}
              onChange={(e) => setNewStaff({ ...newStaff, branch: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option>Main Branch</option>
              <option>CBD Branch</option>
              <option>Mall Branch</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Add Staff</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
