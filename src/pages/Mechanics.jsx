import { useState, useEffect, useMemo } from 'react'
import { HardHat, Wrench, CheckCircle, Clock, Plus, Edit3 } from 'lucide-react'
import Modal from '@/components/common/Modal'
import Button from '@/components/common/Button'
import ExportMenu from '@/components/common/ExportMenu'
import { formatCurrency } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchTechnicians, createTechnician, updateTechnician, fetchJobCards } from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import toast from 'react-hot-toast'

// Technicians are master data only, per the client's FSD -- they never log
// in, unlike every other role in this app. This page is their roster
// (add/edit/deactivate) plus a workload lens over the same job_cards data
// Job Cards already manages.
function TechnicianModal({ tenant, technician, onClose, onSaved }) {
  const [name, setName] = useState(technician?.name || '')
  const [phone, setPhone] = useState(technician?.phone || '')
  const [specialty, setSpecialty] = useState(technician?.specialty || '')
  const [isActive, setIsActive] = useState(technician?.is_active !== false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      if (technician) {
        await updateTechnician(technician.id, { name: name.trim(), phone: phone.trim() || null, specialty: specialty.trim() || null, is_active: isActive })
      } else {
        await createTechnician(tenant.id, { name: name.trim(), phone: phone.trim(), specialty: specialty.trim() })
      }
      toast.success(technician ? 'Technician updated' : 'Technician added')
      onSaved()
    } catch (err) {
      toast.error(err.message || 'Failed to save technician')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen title={technician ? 'Edit Technician' : 'Add Technician'} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Specialty</label>
            <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. Brakes, Engine" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
        </div>
        {technician && (
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Active (available for new job cards)
          </label>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="workshop" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function Mechanics() {
  const { tenant } = useAuthStore()
  const [technicians, setTechnicians] = useState([])
  const [jobCards, setJobCards] = useState([])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const load = () => {
    if (!tenant?.id) return
    fetchTechnicians(tenant.id).then(setTechnicians).catch(() => {})
    loadWithOfflineCache(['jobCards', tenant.id], () => fetchJobCards(tenant.id), { onData: setJobCards })
  }
  useEffect(load, [tenant?.id])

  const rows = useMemo(() => technicians.map((t) => {
    const assigned = jobCards.filter((j) => j.assigned_to === t.id)
    const active = assigned.filter((j) => ['open', 'in_progress'].includes(j.status))
    const completed = assigned.filter((j) => j.status === 'completed')
    const revenue = completed.reduce((sum, j) => sum + (Number(j.total) || 0), 0)
    return { technician: t, active, completed, revenue }
  }), [technicians, jobCards])

  const exportRows = useMemo(() => rows.map(({ technician, active, completed, revenue }) => ({
    name: technician.name,
    specialty: technician.specialty || '',
    active: active.length,
    completed: completed.length,
    revenue: formatCurrency(revenue),
  })), [rows])
  const exportColumns = [
    { header: 'Name', key: 'name' },
    { header: 'Specialty', key: 'specialty' },
    { header: 'Active Jobs', key: 'active' },
    { header: 'Completed Jobs', key: 'completed' },
    { header: 'Value Completed', key: 'revenue' },
  ]

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Mechanics</h1>
          <p className="text-sm text-slate-500">Your technician roster and who's carrying what</p>
        </div>
        <div className="flex gap-2">
          <ExportMenu data={exportRows} columns={exportColumns} title="Mechanics" filename="mechanics" />
          <Button variant="workshop" onClick={() => { setEditing(null); setShowForm(true) }}><Plus className="h-4 w-4" /> Add Technician</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-700">
          <HardHat className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500">No technicians yet — add your team</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ technician, active, completed, revenue }) => (
            <div key={technician.id} className={`rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 ${!technician.is_active ? 'opacity-50' : ''}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-amber-100 text-sm font-bold text-red-700 dark:from-red-950 dark:to-amber-950 dark:text-red-400">
                    {technician.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{technician.name}</p>
                    <p className="text-xs text-slate-500">{technician.specialty || 'General'}{!technician.is_active && ' · Inactive'}</p>
                  </div>
                </div>
                <button onClick={() => { setEditing(technician); setShowForm(true) }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-blue-50 p-2 dark:bg-blue-950/40">
                  <p className="flex items-center justify-center gap-1 text-xs text-blue-600 dark:text-blue-400"><Clock className="h-3 w-3" /> Active</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">{active.length}</p>
                </div>
                <div className="rounded-xl bg-green-50 p-2 dark:bg-green-950/40">
                  <p className="flex items-center justify-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle className="h-3 w-3" /> Done</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">{completed.length}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-2 dark:bg-amber-950/40">
                  <p className="flex items-center justify-center gap-1 text-xs text-amber-600 dark:text-amber-400"><Wrench className="h-3 w-3" /> Value</p>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white">{formatCurrency(revenue)}</p>
                </div>
              </div>
              {active.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {active.map((j) => (
                    <p key={j.id} className="truncate text-xs text-slate-500">
                      <span className="font-mono">{j.job_card_no}</span> — {j.vehicles?.reg_number || j.vehicles?.make || 'vehicle'}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <TechnicianModal
          tenant={tenant}
          technician={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}
