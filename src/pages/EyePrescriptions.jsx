import { useState, useEffect, useMemo } from 'react'
import { Glasses, Plus, RefreshCw, Search } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { formatDate } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchEyePrescriptions, createEyePrescription, fetchDoctors, fetchCustomers } from '@/lib/db'
import toast from 'react-hot-toast'

const BLANK = {
  customerId: '', patientName: '', doctorId: '',
  odSphere: '', odCylinder: '', odAxis: '', odAdd: '',
  osSphere: '', osCylinder: '', osAxis: '', osAdd: '',
  pd: '', prescriptionDate: '', expiryDate: '', notes: '',
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))

export default function EyePrescriptions() {
  const { tenant, user } = useAuthStore()
  const [rows, setRows] = useState([])
  const [doctors, setDoctors] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    Promise.all([fetchEyePrescriptions(tenant.id), fetchDoctors(tenant.id).catch(() => []), fetchCustomers(tenant.id).catch(() => [])])
      .then(([r, d, c]) => { setRows(r); setDoctors(d); setCustomers(c) })
      .catch((err) => toast.error(err.message || 'Failed to load eye prescriptions'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const openAdd = () => { setForm(BLANK); setShowAdd(true) }

  const save = async (e) => {
    e.preventDefault()
    if (!form.patientName.trim() && !form.customerId) { toast.error('Patient name or customer is required'); return }
    setSaving(true)
    try {
      const created = await createEyePrescription(tenant.id, {
        customerId: form.customerId || null, patientName: form.patientName.trim() || null, doctorId: form.doctorId || null,
        odSphere: num(form.odSphere), odCylinder: num(form.odCylinder), odAxis: num(form.odAxis), odAdd: num(form.odAdd),
        osSphere: num(form.osSphere), osCylinder: num(form.osCylinder), osAxis: num(form.osAxis), osAdd: num(form.osAdd),
        pd: num(form.pd), prescriptionDate: form.prescriptionDate || null, expiryDate: form.expiryDate || null,
        notes: form.notes.trim() || null, userId: user?.id || null,
      })
      setRows((prev) => [created, ...prev])
      toast.success('Eye prescription filed')
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to file eye prescription')
    } finally {
      setSaving(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => (r.customers?.name || r.patient_name || '').toLowerCase().includes(q))
  }, [rows, search])

  const eyeField = (side, field, label, step = '0.25') => (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <input type="number" step={step} value={form[`${side}${field}`]} onChange={(e) => setForm((f) => ({ ...f, [`${side}${field}`]: e.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
    </div>
  )

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <Glasses className="h-5 w-5 text-brand-600" /> Optometry
          </h1>
          <p className="text-sm text-slate-500">Eye prescription filing and lookup.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button variant="primary" onClick={openAdd}><Plus className="h-4 w-4" /> File Eye Prescription</Button>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patient…" className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                {['Patient', 'Doctor', 'OD (Sph/Cyl/Axis)', 'OS (Sph/Cyl/Axis)', 'PD', 'Date', 'Expires'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">{rows.length === 0 ? 'No eye prescriptions filed yet.' : 'No records match your search.'}</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{r.customers?.name || r.patient_name || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.doctors?.name ? `Dr. ${r.doctors.name}` : '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{[r.od_sphere, r.od_cylinder, r.od_axis].filter((v) => v !== null).join(' / ') || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{[r.os_sphere, r.os_cylinder, r.os_axis].filter((v) => v !== null).join(' / ') || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.pd ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.prescription_date ? formatDate(r.prescription_date) : '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.expiry_date ? formatDate(r.expiry_date) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="File Eye Prescription">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Customer (optional)</label>
            <select
              value={form.customerId}
              onChange={(e) => {
                const c = customers.find((x) => x.id === e.target.value)
                setForm((f) => ({ ...f, customerId: e.target.value, patientName: c ? c.name : f.patientName }))
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">— Not on file —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Patient Name *</label>
            <input value={form.patientName} onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Doctor / Optometrist</label>
            <select value={form.doctorId} onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">— None —</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">OD (Right Eye)</p>
            <div className="grid grid-cols-4 gap-2">
              {eyeField('od', 'Sphere', 'Sphere')}
              {eyeField('od', 'Cylinder', 'Cylinder')}
              {eyeField('od', 'Axis', 'Axis', '1')}
              {eyeField('od', 'Add', 'Add')}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">OS (Left Eye)</p>
            <div className="grid grid-cols-4 gap-2">
              {eyeField('os', 'Sphere', 'Sphere')}
              {eyeField('os', 'Cylinder', 'Cylinder')}
              {eyeField('os', 'Axis', 'Axis', '1')}
              {eyeField('os', 'Add', 'Add')}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">PD</label>
              <input type="number" step="0.5" value={form.pd} onChange={(e) => setForm((f) => ({ ...f, pd: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date</label>
              <input type="date" value={form.prescriptionDate} onChange={(e) => setForm((f) => ({ ...f, prescriptionDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Expires</label>
              <input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Filing…' : 'File Eye Prescription'}</Button>
        </form>
      </Modal>
    </div>
  )
}
