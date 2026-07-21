import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Clock, RefreshCw } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import DateInput from '@/components/common/DateInput'
import { fetchShifts, insertShift, deleteShift } from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import toast from 'react-hot-toast'

function startOfWeek(d) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  return new Date(date.setDate(diff))
}
function toISODate(d) {
  return d.toISOString().slice(0, 10)
}
function formatShiftDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}

const BLANK_SHIFT = { userId: '', shiftDate: '', startTime: '08:00', endTime: '17:00', notes: '' }

// Shop managers plan working hours/rotations for their own branch instead of
// managing staff accounts — that stays Vendor-only (see Staff.jsx).
export default function ShiftRoster({ tenant, branch, staffList, userId }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(BLANK_SHIFT)
  const [saving, setSaving] = useState(false)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const fromDate = toISODate(weekStart)
  const toDate = toISODate(weekEnd)

  const loadShifts = () => {
    if (!tenant?.id) return
    loadWithOfflineCache(
      ['shifts', tenant.id, fromDate, toDate],
      () => fetchShifts(tenant.id, { fromDate, toDate }),
      { onData: setShifts, onError: () => toast.error('Failed to load shifts'), onLoadingChange: setLoading },
    )
  }

  useEffect(loadShifts, [tenant?.id, fromDate, toDate])

  useEffect(() => {
    window.addEventListener('tengapos:force-refresh', loadShifts)
    return () => window.removeEventListener('tengapos:force-refresh', loadShifts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, fromDate, toDate])

  const openAdd = () => {
    setForm({ ...BLANK_SHIFT, shiftDate: toISODate(new Date()) })
    setShowAdd(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.userId || !form.shiftDate) { toast.error('Pick a staff member and date'); return }
    if (form.endTime <= form.startTime) { toast.error('End time must be after start time'); return }
    setSaving(true)
    try {
      const created = await insertShift(tenant.id, branch?.id, { ...form, createdBy: userId })
      setShifts((prev) => [...prev, created].sort((a, b) =>
        a.shift_date === b.shift_date ? a.start_time.localeCompare(b.start_time) : a.shift_date.localeCompare(b.shift_date)))
      toast.success('Shift added')
      setShowAdd(false)
    } catch (err) {
      toast.error(err.message || 'Failed to add shift')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const prev = shifts
    setShifts((s) => s.filter((sh) => sh.id !== id))
    try {
      await deleteShift(id)
      toast.success('Shift removed')
    } catch (err) {
      toast.error(err.message || 'Failed to remove shift')
      setShifts(prev)
    }
  }

  const groupedByDate = shifts.reduce((acc, s) => {
    (acc[s.shift_date] ||= []).push(s)
    return acc
  }, {})

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ← Prev
          </button>
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {formatShiftDate(fromDate)} – {formatShiftDate(toDate)}
          </span>
          <button
            onClick={() => setWeekStart((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Next →
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={loadShifts} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add Shift</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading shifts…
          </div>
        ) : Object.keys(groupedByDate).length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No shifts scheduled this week — click "Add Shift" to plan working hours.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <AnimatePresence>
              {Object.keys(groupedByDate).sort().map((date) => (
                <div key={date} className="p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{formatShiftDate(date)}</p>
                  <div className="space-y-2">
                    {groupedByDate[date].map((s) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                            {s.users?.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{s.users?.name || 'Unknown'}</p>
                            <p className="flex items-center gap-1 text-xs text-slate-500">
                              <Clock className="h-3 w-3" /> {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                              {s.notes && <span className="ml-1 italic">· {s.notes}</span>}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add Shift">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Staff Member</label>
            <select
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
            >
              <option value="">Select staff…</option>
              {staffList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Date</label>
            <DateInput
              value={form.shiftDate}
              onChange={(e) => setForm((f) => ({ ...f, shiftDate: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Start Time</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">End Time</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Notes (optional)</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. covering for Rudo"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Shift'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
