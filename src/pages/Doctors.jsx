import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Stethoscope, Plus, RefreshCw, Search, Pencil, Trash2, Loader2 } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/stores/authStore'
import { fetchDoctors, createDoctor, updateDoctor, deleteDoctor } from '@/lib/db'
import toast from 'react-hot-toast'

const BLANK = { name: '', phone: '', email: '', licenseNo: '', specialty: '' }

export default function Doctors() {
  const { tenant, role } = useAuthStore()
  // Directory management (add/edit/remove) is a manager-level action, same
  // split as the RLS itself (doctors_write/doctors_update) -- cashier/
  // shop_assistant can still see the directory (needed to pick a doctor
  // when filing/dispensing) but the UI hides actions they'd be denied anyway.
  const canManage = ['vendor', 'shop_manager', 'supervisor'].includes(role)
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchDoctors(tenant.id).then(setDoctors).catch((err) => toast.error(err.message || 'Failed to load doctors')).finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const openAdd = () => { setForm(BLANK); setEditing({}) }
  const openEdit = (d) => { setForm({ name: d.name || '', phone: d.phone || '', email: d.email || '', licenseNo: d.license_no || '', specialty: d.specialty || '' }); setEditing(d) }

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      if (editing?.id) {
        const updated = await updateDoctor(editing.id, form)
        setDoctors((prev) => prev.map((d) => d.id === updated.id ? updated : d))
        toast.success('Doctor updated')
      } else {
        const created = await createDoctor(tenant.id, form)
        setDoctors((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success('Doctor added')
      }
      setEditing(null)
    } catch (err) {
      toast.error(err.message || 'Failed to save doctor')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (d) => {
    if (!window.confirm(`Remove Dr. ${d.name}?`)) return
    setDeletingId(d.id)
    try {
      await deleteDoctor(d.id)
      setDoctors((prev) => prev.filter((x) => x.id !== d.id))
      toast.success(`Dr. ${d.name} removed`)
    } catch (err) {
      toast.error(err.message || 'Failed to remove doctor')
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return doctors
    return doctors.filter((d) => d.name?.toLowerCase().includes(q) || d.phone?.toLowerCase().includes(q) || d.license_no?.toLowerCase().includes(q) || d.specialty?.toLowerCase().includes(q))
  }, [doctors, search])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <Stethoscope className="h-5 w-5 text-brand-600" /> Doctors
          </h1>
          <p className="text-sm text-slate-500">Prescriber directory — used to verify and file prescriptions.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canManage && <Button variant="primary" onClick={openAdd}><Plus className="h-4 w-4" /> Add Doctor</Button>}
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, license…" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Name', 'Specialty', 'License No.', 'Phone', 'Email', ...(canManage ? ['Actions'] : [])].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">{doctors.length === 0 ? 'No doctors on file yet.' : 'No doctors match your search.'}</td></tr>
                ) : filtered.map((d) => (
                  <motion.tr key={d.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">Dr. {d.name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{d.specialty || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{d.license_no || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{d.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{d.email || '—'}</td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(d)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => handleDelete(d)} disabled={deletingId === d.id} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40">
                            {deletingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    )}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit Dr. ${editing.name}` : 'Add Doctor'}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Specialty</label>
            <input value={form.specialty} onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))} placeholder="e.g. General Practice, Cardiology" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">License No.</label>
            <input value={form.licenseNo} onChange={(e) => setForm((f) => ({ ...f, licenseNo: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Saving…' : editing?.id ? 'Save Changes' : 'Add Doctor'}</Button>
        </form>
      </Modal>
    </div>
  )
}
