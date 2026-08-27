import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Plus, RefreshCw, Check, X, CheckCheck, UserX } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { formatDateTime } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchAppointments, createAppointment, updateAppointmentStatus, fetchDoctors, fetchCustomers } from '@/lib/db'
import toast from 'react-hot-toast'

const STATUS_BADGE = {
  booked: { label: 'Booked', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  confirmed: { label: 'Confirmed', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  completed: { label: 'Completed', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
  no_show: { label: 'No-show', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
}

const BLANK = { customerId: '', patientName: '', doctorId: '', purpose: '', scheduledDate: '', scheduledTime: '', notes: '' }

export default function Appointments() {
  const { tenant, branch, user } = useAuthStore()
  const [appointments, setAppointments] = useState([])
  const [doctors, setDoctors] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState(null)

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    Promise.all([fetchAppointments(tenant.id), fetchDoctors(tenant.id).catch(() => []), fetchCustomers(tenant.id).catch(() => [])])
      .then(([a, d, c]) => { setAppointments(a); setDoctors(d); setCustomers(c) })
      .catch((err) => toast.error(err.message || 'Failed to load appointments'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [tenant?.id])

  const upcoming = useMemo(
    () => [...appointments].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
    [appointments],
  )

  const openAdd = () => { setForm(BLANK); setShowAdd(true) }

  const save = async (e) => {
    e.preventDefault()
    if (!form.patientName.trim() && !form.customerId) { toast.error('Patient name or customer is required'); return }
    if (!form.scheduledDate || !form.scheduledTime) { toast.error('Date and time are required'); return }
    setSaving(true)
    try {
      const scheduledAt = new Date(`${form.scheduledDate}T${form.scheduledTime}`).toISOString()
      const created = await createAppointment(tenant.id, {
        branchId: branch?.id || null, customerId: form.customerId || null, patientName: form.patientName.trim() || null,
        doctorId: form.doctorId || null, purpose: form.purpose.trim() || null, scheduledAt, notes: form.notes.trim() || null, userId: user?.id || null,
      })
      setAppointments((prev) => [...prev, created])
      toast.success('Appointment booked')
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to book appointment')
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (a, status) => {
    setUpdatingId(a.id)
    try {
      await updateAppointmentStatus(a.id, status)
      setAppointments((prev) => prev.map((x) => x.id === a.id ? { ...x, status } : x))
    } catch (err) {
      toast.error(err.message || 'Failed to update appointment')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <CalendarClock className="h-5 w-5 text-brand-600" /> Appointments
          </h1>
          <p className="text-sm text-slate-500">Book and manage patient consultations.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button variant="primary" onClick={openAdd}><Plus className="h-4 w-4" /> Book Appointment</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                {['Date & Time', 'Patient', 'Doctor', 'Purpose', 'Status', 'Actions'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : upcoming.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">No appointments booked yet.</td></tr>
              ) : upcoming.map((a) => {
                const badge = STATUS_BADGE[a.status]
                const busy = updatingId === a.id
                return (
                  <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(a.scheduled_at)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{a.customers?.name || a.patient_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{a.doctors?.name ? `Dr. ${a.doctors.name}` : '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{a.purpose || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge?.bg} ${badge?.text}`}>{badge?.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      {['booked', 'confirmed'].includes(a.status) && (
                        <div className="flex items-center gap-1">
                          {a.status === 'booked' && (
                            <button disabled={busy} onClick={() => setStatus(a, 'confirmed')} title="Confirm" className="rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-600 disabled:opacity-50 dark:hover:bg-green-950/40"><Check className="h-4 w-4" /></button>
                          )}
                          <button disabled={busy} onClick={() => setStatus(a, 'completed')} title="Mark complete" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800"><CheckCheck className="h-4 w-4" /></button>
                          <button disabled={busy} onClick={() => setStatus(a, 'no_show')} title="No-show" className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50 dark:hover:bg-amber-950/40"><UserX className="h-4 w-4" /></button>
                          <button disabled={busy} onClick={() => setStatus(a, 'cancelled')} title="Cancel" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/40"><X className="h-4 w-4" /></button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Book Appointment">
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
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Doctor</label>
            <select value={form.doctorId} onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">— None —</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date *</label>
              <input type="date" value={form.scheduledDate} onChange={(e) => setForm((f) => ({ ...f, scheduledDate: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Time *</label>
              <input type="time" value={form.scheduledTime} onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))} required className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Purpose</label>
            <input value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Follow-up consultation" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={saving} className="w-full justify-center">{saving ? 'Booking…' : 'Book Appointment'}</Button>
        </form>
      </Modal>
    </div>
  )
}
