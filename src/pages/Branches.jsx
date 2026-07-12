import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Store, MapPin, Users, DollarSign, Plus, Edit3, Trash2,
  TrendingUp, Package, CheckCircle, X, BarChart3, Phone,
  ArrowLeft, Eye, RefreshCw,
} from 'lucide-react'
import { formatCurrency } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import Modal from '@/components/common/Modal'
import { fetchBranches, insertBranch, updateBranch, deleteBranch } from '@/lib/db'
import toast from 'react-hot-toast'

const CAN_MANAGE = ['vendor']

const BLANK = { name: '', location: '', address: '', phone: '', manager: '', status: 'active' }

function BranchDetail({ branch, onBack }) {
  const profit = branch.revenue - branch.expenses
  const margin = ((profit / branch.revenue) * 100).toFixed(1)

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Back to Branches
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand-100 p-3 dark:bg-brand-900/40">
            <Store className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{branch.name}</h2>
            <div className="flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="h-3.5 w-3.5" />{branch.location}
            </div>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${branch.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700'}`}>
          {branch.status}
        </span>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Revenue', value: formatCurrency(branch.revenue), icon: DollarSign, color: 'brand' },
          { label: 'Gross Profit', value: formatCurrency(profit), sub: `${margin}% margin`, icon: TrendingUp, color: 'green' },
          { label: 'Orders', value: branch.orders, icon: BarChart3, color: 'purple' },
          { label: 'Staff', value: branch.staff, icon: Users, color: 'amber' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className={`mb-2 inline-flex rounded-xl p-2 ${k.color === 'brand' ? 'bg-brand-50 dark:bg-brand-900/40' : k.color === 'green' ? 'bg-green-50 dark:bg-green-900/40' : k.color === 'purple' ? 'bg-purple-50 dark:bg-purple-900/40' : 'bg-amber-50 dark:bg-amber-900/40'}`}>
              <k.icon className={`h-4 w-4 ${k.color === 'brand' ? 'text-brand-600 dark:text-brand-400' : k.color === 'green' ? 'text-green-600 dark:text-green-400' : k.color === 'purple' ? 'text-purple-600 dark:text-purple-400' : 'text-amber-600 dark:text-amber-400'}`} />
            </div>
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">{k.value}</div>
            <div className="text-xs text-slate-500">{k.label}</div>
            {k.sub && <div className="text-xs text-slate-400">{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Branch info */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">Branch Details</h3>
          <dl className="space-y-3">
            {[
              { label: 'Address', value: branch.address },
              { label: 'Phone', value: branch.phone },
              { label: 'Branch Manager', value: branch.manager },
            ].map((d) => (
              <div key={d.label} className="flex items-start gap-3">
                <dt className="w-32 flex-shrink-0 text-xs font-semibold text-slate-500">{d.label}</dt>
                <dd className="text-sm text-slate-900 dark:text-white">{d.value || '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Top products */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">Top Sellers</h3>
          <ul className="space-y-2">
            {branch.topProducts.map((p, i) => (
              <li key={p} className="flex items-center gap-3">
                <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-yellow-400 text-yellow-900' : i === 1 ? 'bg-slate-300 text-slate-700' : 'bg-amber-700 text-white'}`}>
                  {i + 1}
                </span>
                <span className="text-sm text-slate-700 dark:text-slate-300">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Inventory snapshot */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">Inventory Snapshot</h3>
          <div className="space-y-3">
            {branch.inventory.map((item) => {
              const pct = Math.min((item.qty / (item.reorder * 3)) * 100, 100)
              const low = item.qty <= item.reorder
              return (
                <div key={item.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{item.name}</span>
                    <span className={`font-semibold ${low ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                      {item.qty} units
                      {low && ' ⚠ Low'}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-2 rounded-full transition-all ${low ? 'bg-red-400' : 'bg-brand-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">Reorder at {item.reorder} units</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Branches() {
  const { role, tenant } = useAuthStore()
  const canManage = CAN_MANAGE.includes(role)

  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(BLANK)

  const loadBranches = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchBranches(tenant.id)
      .then(data => setBranches(data.map(b => ({
        ...b, isMain: b.is_main, status: b.is_active ? 'active' : 'inactive',
        location: b.address || '', manager: '', staff: 0, revenue: 0, expenses: 0, orders: 0, topProducts: [], inventory: [],
      }))))
      .catch(() => toast.error('Failed to load branches'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadBranches() }, [tenant?.id])

  if (viewing) {
    return (
      <div className="p-4 sm:p-6">
        <BranchDetail branch={viewing} onBack={() => setViewing(null)} />
      </div>
    )
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editing) {
        const updated = await updateBranch(editing.id, { name: form.name, address: form.address, phone: form.phone, isActive: form.status === 'active' })
        setBranches(prev => prev.map(b => b.id === editing.id ? { ...b, ...updated, isMain: updated.is_main, status: updated.is_active ? 'active' : 'inactive' } : b))
        toast.success('Branch updated'); setEditing(null)
      } else {
        const created = await insertBranch(tenant.id, { name: form.name, address: form.address, phone: form.phone })
        setBranches(prev => [...prev, { ...created, isMain: false, status: 'active', location: created.address || '', manager: '', staff: 0, revenue: 0, expenses: 0, orders: 0, topProducts: [], inventory: [] }])
        toast.success('Branch added'); setShowNew(false)
      }
      setForm(BLANK)
    } catch (err) {
      toast.error(err.message || 'Failed to save branch')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const b = branches.find(x => x.id === id)
    if (b?.isMain || b?.is_main) { toast.error('Cannot delete main branch'); return }
    setBranches(prev => prev.filter(x => x.id !== id))
    toast.success('Branch removed')
    await deleteBranch(id).catch(() => {})
  }

  const openEdit = (branch) => {
    setForm({ name: branch.name, location: branch.location || branch.address || '', address: branch.address || '', phone: branch.phone || '', manager: branch.manager || '', status: branch.status || 'active' })
    setEditing(branch)
  }

  const totalRevenue = branches.reduce((s, b) => s + (b.revenue || 0), 0)
  const totalStaff = branches.reduce((s, b) => s + (b.staff || 0), 0)

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Branches</h1>
          <p className="text-sm text-slate-500">{branches.length} location{branches.length !== 1 ? 's' : ''} · {totalStaff} total staff · {formatCurrency(totalRevenue)} combined revenue</p>
        </div>
        {canManage && (
          <button
            onClick={() => { setForm(BLANK); setShowNew(true) }}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Add Branch
          </button>
        )}
      </div>

      {/* Summary row */}
      {branches.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <DollarSign className="mb-1.5 h-5 w-5 text-brand-500" />
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">{formatCurrency(totalRevenue)}</div>
            <div className="text-xs text-slate-500">Combined Revenue</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <Users className="mb-1.5 h-5 w-5 text-purple-500" />
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">{totalStaff}</div>
            <div className="text-xs text-slate-500">Total Staff</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <Store className="mb-1.5 h-5 w-5 text-green-500" />
            <div className="text-xl font-extrabold text-slate-900 dark:text-white">{branches.filter(b => b.status === 'active').length}</div>
            <div className="text-xs text-slate-500">Active Branches</div>
          </div>
        </div>
      )}

      {branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-700">
          <Store className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500">No branches yet</p>
          {canManage && <p className="mt-1 text-xs text-slate-400">Click "Add Branch" to set up your first location</p>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {branches.map((branch, i) => (
              <motion.div
                key={branch.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                {/* Header */}
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-brand-100 p-2.5 dark:bg-brand-900/40">
                      <Store className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 dark:text-white">{branch.name}</h3>
                        {branch.isMain && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700 dark:bg-brand-900/40 dark:text-brand-400">Main</span>}
                      </div>
                      {branch.location && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3" />{branch.location}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${branch.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-slate-100 text-slate-500'}`}>
                    {branch.status}
                  </span>
                </div>

                {/* Stats */}
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800">
                    <DollarSign className="mb-1 h-3.5 w-3.5 text-slate-400" />
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(branch.revenue)}</div>
                    <div className="text-xs text-slate-400">Revenue</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800">
                    <Users className="mb-1 h-3.5 w-3.5 text-slate-400" />
                    <div className="text-sm font-bold text-slate-900 dark:text-white">{branch.staff}</div>
                    <div className="text-xs text-slate-400">Staff</div>
                  </div>
                </div>

                {branch.manager && (
                  <p className="mb-3 text-xs text-slate-500">
                    Manager: <span className="font-semibold text-slate-700 dark:text-slate-300">{branch.manager}</span>
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewing(branch)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Eye className="h-3.5 w-3.5" />View Details
                  </button>
                  {canManage && (
                    <>
                      <button onClick={() => openEdit(branch)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      {!branch.isMain && (
                        <button onClick={() => handleDelete(branch.id)} className="rounded-xl border border-red-200 p-2 text-red-500 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={showNew || !!editing}
        onClose={() => { setShowNew(false); setEditing(null); setForm(BLANK) }}
        title={editing ? `Edit: ${editing.name}` : 'Add Branch'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Branch Name *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Bulawayo Branch"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Bulawayo CBD"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Street Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="e.g. 12 Fife St, Bulawayo"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+263..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Branch Manager</label>
            <input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })}
              placeholder="Manager name"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => { setShowNew(false); setEditing(null); setForm(BLANK) }}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
              {editing ? 'Save Changes' : 'Add Branch'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
