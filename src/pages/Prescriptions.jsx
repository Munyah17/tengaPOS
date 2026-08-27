import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { withOfflineCache } from '@/lib/offlineCache'
import { Pill, Search, Plus, FolderOpen, RefreshCw, Paperclip, CalendarClock } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import ExportMenu from '@/components/common/ExportMenu'
import DateInput, { TimeField } from '@/components/common/DateInput'
import { formatDateTime, formatDate } from '@/utils/formatters'
import { combineDateAndTime } from '@/utils/dateRanges'
import { useAuthStore } from '@/stores/authStore'
import {
  fetchPrescriptionDispenses, fetchPrescriptions, createPrescription, uploadPrescriptionImage,
  getPrescriptionImageUrl, fetchDoctors, fetchCustomers, createMedicationSchedule,
} from '@/lib/db'
import toast from 'react-hot-toast'

const CLASS_BADGE = {
  prescription: { label: 'Prescription', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  controlled: { label: 'Controlled', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
}

const STATUS_BADGE = {
  active: { label: 'Active', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  dispensed: { label: 'Dispensed', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  expired: { label: 'Expired', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
}

const exportColumns = [
  { header: 'Date', key: 'date' },
  { header: 'Product', key: 'product' },
  { header: 'Qty', key: 'qty' },
  { header: 'Class', key: 'classLabel' },
  { header: 'Schedule', key: 'schedule' },
  { header: 'Customer', key: 'customer' },
  { header: 'Prescriber', key: 'prescriber' },
  { header: 'License No.', key: 'licenseNo' },
  { header: 'Branch', key: 'branch' },
  { header: 'Dispensed By', key: 'dispensedBy' },
]

const BLANK_FILE_FORM = { customerId: '', patientName: '', doctorId: '', doctorName: '', prescriptionDate: '', notes: '' }
const BLANK_REMINDER = { productId: '', frequencyDays: '28' }

export default function Prescriptions() {
  const { tenant, user } = useAuthStore()
  const [tab, setTab] = useState('log') // 'log' | 'filed'
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')

  const dispensesQuery = useQuery({
    queryKey: ['prescriptionDispenses', tenant?.id],
    queryFn: withOfflineCache(['prescriptionDispenses', tenant?.id], async () => {
      const rows = await fetchPrescriptionDispenses(tenant.id)
      return rows.map((r) => ({
        id: r.id,
        productId: r.product_id,
        date: r.created_at,
        product: r.products?.name || '—',
        qty: r.qty,
        dispensingClass: r.dispensing_class,
        classLabel: CLASS_BADGE[r.dispensing_class]?.label || r.dispensing_class,
        schedule: r.controlled_schedule || '',
        customerId: r.customer_id,
        customer: r.customer_name || '—',
        prescriber: r.prescriber_name,
        licenseNo: r.prescriber_license_no || '',
        branch: r.branches?.name || '—',
        dispensedBy: r.users?.name || '—',
      }))
    }),
    enabled: !!tenant?.id,
    staleTime: 30000,
  })
  const allDispenses = dispensesQuery.data || []
  const loading = dispensesQuery.isLoading

  const filtered = useMemo(() => {
    let rows = allDispenses
    if (dateFrom || dateTo) {
      rows = rows.filter((r) => {
        const d = new Date(r.date)
        if (dateFrom && d < combineDateAndTime(dateFrom, timeFrom, '00:00', 0)) return false
        if (dateTo && d > combineDateAndTime(dateTo, timeTo, '23:59', 59.999)) return false
        return true
      })
    }
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) =>
        r.product.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.prescriber.toLowerCase().includes(q) ||
        r.licenseNo.toLowerCase().includes(q)
      )
    }
    return rows
  }, [allDispenses, search, dateFrom, dateTo, timeFrom, timeTo])

  const dateFiltered = dateFrom || dateTo

  // ─── Filed Prescriptions ──────────────────────────────────────────────
  const [filed, setFiled] = useState([])
  const [loadingFiled, setLoadingFiled] = useState(false)
  const [doctors, setDoctors] = useState([])
  const [customers, setCustomers] = useState([])
  const [showFile, setShowFile] = useState(false)
  const [fileForm, setFileForm] = useState(BLANK_FILE_FORM)
  const [fileImage, setFileImage] = useState(null)
  const [filing, setFiling] = useState(false)
  const [reminderFor, setReminderFor] = useState(null) // dispense row while setting a refill reminder
  const [reminderForm, setReminderForm] = useState(BLANK_REMINDER)
  const [savingReminder, setSavingReminder] = useState(false)

  const loadFiled = () => {
    if (!tenant?.id) return
    setLoadingFiled(true)
    Promise.all([fetchPrescriptions(tenant.id), fetchDoctors(tenant.id).catch(() => []), fetchCustomers(tenant.id).catch(() => [])])
      .then(([p, d, c]) => { setFiled(p); setDoctors(d); setCustomers(c) })
      .catch((err) => toast.error(err.message || 'Failed to load filed prescriptions'))
      .finally(() => setLoadingFiled(false))
  }
  useEffect(() => { if (tab === 'filed') loadFiled() }, [tab, tenant?.id])

  const openFile = () => { setFileForm(BLANK_FILE_FORM); setFileImage(null); setShowFile(true) }

  const saveFiled = async (e) => {
    e.preventDefault()
    if (!fileForm.patientName.trim() && !fileForm.customerId) { toast.error('Patient name or customer is required'); return }
    setFiling(true)
    try {
      let imagePath = null
      if (fileImage) imagePath = await uploadPrescriptionImage(tenant.id, fileImage)
      const created = await createPrescription(tenant.id, {
        customerId: fileForm.customerId || null, patientName: fileForm.patientName.trim() || null,
        doctorId: fileForm.doctorId || null, doctorName: fileForm.doctorName.trim() || null,
        prescriptionDate: fileForm.prescriptionDate || null, imagePath, notes: fileForm.notes.trim() || null, userId: user?.id || null,
      })
      setFiled((prev) => [created, ...prev])
      toast.success('Prescription filed')
      setShowFile(false)
    } catch (err) {
      toast.error(err.message || 'Failed to file prescription')
    } finally {
      setFiling(false)
    }
  }

  const viewImage = async (path) => {
    try {
      const url = await getPrescriptionImageUrl(path)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.error(err.message || 'Failed to open document')
    }
  }

  const openReminder = (row) => { setReminderForm(BLANK_REMINDER); setReminderFor(row) }
  const saveReminder = async (e) => {
    e.preventDefault()
    if (!reminderFor.customerId) { toast.error('This dispense has no linked customer to remind — pick one at checkout next time'); return }
    setSavingReminder(true)
    try {
      await createMedicationSchedule(tenant.id, {
        customerId: reminderFor.customerId, productId: reminderFor.productId,
        frequencyDays: parseInt(reminderForm.frequencyDays) || 28, userId: user?.id || null,
      })
      toast.success('Refill reminder set')
      setReminderFor(null)
    } catch (err) {
      toast.error(err.message || 'Failed to set reminder')
    } finally {
      setSavingReminder(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <Pill className="h-5 w-5 text-brand-600" /> Prescriptions
          </h1>
          <p className="text-sm text-slate-500">File and search prescriptions, and review the dispensing compliance log.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'log' ? (
            <>
              <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" className="w-36" />
              <TimeField value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
              <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" className="w-36" />
              <TimeField value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
              {dateFiltered && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeFrom(''); setTimeTo('') }} className="text-slate-400 hover:text-red-500">
                  Clear
                </button>
              )}
              <ExportMenu
                data={filtered}
                columns={exportColumns}
                title={`Prescriptions${dateFiltered ? ` (${dateFrom || '…'} to ${dateTo || '…'})` : ''}`}
                filename="tengapos_prescriptions"
              />
            </>
          ) : (
            <>
              <button onClick={loadFiled} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <RefreshCw className={`h-4 w-4 ${loadingFiled ? 'animate-spin' : ''}`} />
              </button>
              <Button variant="primary" onClick={openFile}><Plus className="h-4 w-4" /> File a Prescription</Button>
            </>
          )}
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
        <button onClick={() => setTab('log')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'log' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}>
          <Pill className="h-4 w-4" /> Dispense Log
        </button>
        <button onClick={() => setTab('filed')} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === 'filed' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}>
          <FolderOpen className="h-4 w-4" /> Filed Prescriptions
        </button>
      </div>

      {tab === 'log' && (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product, customer, prescriber…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <tr>
                    {['Date', 'Product', 'Qty', 'Class', 'Customer', 'Prescriber', 'License No.', 'Branch', 'Dispensed By', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={10} className="py-12 text-center text-sm text-slate-400">Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={10} className="py-12 text-center text-sm text-slate-400">
                      {allDispenses.length === 0 ? 'No prescriptions or controlled-substance sales recorded yet.' : 'No records match your search/filter.'}
                    </td></tr>
                  ) : filtered.map((r) => {
                    const badge = CLASS_BADGE[r.dispensingClass]
                    return (
                      <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(r.date)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{r.product}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.qty}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge?.bg || 'bg-slate-100 dark:bg-slate-800'} ${badge?.text || 'text-slate-600 dark:text-slate-400'}`}>
                            {r.classLabel}{r.schedule ? ` — Sch. ${r.schedule}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.customer}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.prescriber}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.licenseNo || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.branch}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.dispensedBy}</td>
                        <td className="px-4 py-3">
                          {r.customerId && (
                            <button onClick={() => openReminder(r)} title="Set refill reminder" className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/40">
                              <CalendarClock className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'filed' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Patient', 'Doctor', 'Date', 'Status', 'Filed By', 'Doc.'].map((h) => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loadingFiled ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">Loading…</td></tr>
                ) : filed.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-slate-400">No prescriptions filed yet.</td></tr>
                ) : filed.map((p) => {
                  const badge = STATUS_BADGE[p.status]
                  return (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{p.customers?.name || p.patient_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{p.doctors?.name ? `Dr. ${p.doctors.name}` : (p.doctor_name || '—')}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{p.prescription_date ? formatDate(p.prescription_date) : formatDate(p.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge?.bg || 'bg-slate-100 dark:bg-slate-800'} ${badge?.text || 'text-slate-600 dark:text-slate-400'}`}>{badge?.label || p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{p.users?.name || '—'}</td>
                      <td className="px-4 py-3">
                        {p.image_path && (
                          <button onClick={() => viewImage(p.image_path)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><Paperclip className="h-4 w-4" /></button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={showFile} onClose={() => setShowFile(false)} title="File a Prescription">
        <form onSubmit={saveFiled} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Customer (optional)</label>
            <select
              value={fileForm.customerId}
              onChange={(e) => {
                const c = customers.find((x) => x.id === e.target.value)
                setFileForm((f) => ({ ...f, customerId: e.target.value, patientName: c ? c.name : f.patientName }))
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">— Not on file —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Patient Name *</label>
            <input value={fileForm.patientName} onChange={(e) => setFileForm((f) => ({ ...f, patientName: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Doctor</label>
            <select value={fileForm.doctorId} onChange={(e) => setFileForm((f) => ({ ...f, doctorId: e.target.value, doctorName: '' }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">— Not on file, type below —</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.name}</option>)}
            </select>
            {!fileForm.doctorId && (
              <input
                value={fileForm.doctorName}
                onChange={(e) => setFileForm((f) => ({ ...f, doctorName: e.target.value }))}
                placeholder="Doctor's name (if not in your directory)"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Prescription Date</label>
            <input type="date" value={fileForm.prescriptionDate} onChange={(e) => setFileForm((f) => ({ ...f, prescriptionDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Document (optional)</label>
            <input type="file" accept="image/*,.pdf" onChange={(e) => setFileImage(e.target.files?.[0] || null)} className="w-full text-sm text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes</label>
            <textarea value={fileForm.notes} onChange={(e) => setFileForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <Button type="submit" variant="primary" disabled={filing} className="w-full justify-center">{filing ? 'Filing…' : 'File Prescription'}</Button>
        </form>
      </Modal>

      <Modal isOpen={!!reminderFor} onClose={() => setReminderFor(null)} title={`Refill Reminder — ${reminderFor?.customer || ''}`}>
        {reminderFor && (
          <form onSubmit={saveReminder} className="space-y-4">
            <p className="text-sm text-slate-500">
              Remind {reminderFor.customer} to refill {reminderFor.product} every N days, counted from their most recent dispense.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Remind every (days)</label>
              <input type="number" min="1" value={reminderForm.frequencyDays} onChange={(e) => setReminderForm((f) => ({ ...f, frequencyDays: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <Button type="submit" variant="primary" disabled={savingReminder} className="w-full justify-center">{savingReminder ? 'Saving…' : 'Set Reminder'}</Button>
          </form>
        )}
      </Modal>
    </div>
  )
}
