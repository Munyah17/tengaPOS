import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, CheckCircle, Clock, AlertCircle, User, Paperclip, X,
  ChevronDown, Search, Calendar, Flag, FileText, Image, File,
  CheckSquare, Square, Upload, Send, Edit3, Trash2,
} from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchTasks, insertTask, updateTaskStatus, deleteTask as dbDeleteTask, fetchStaff } from '@/lib/db'
import toast from 'react-hot-toast'

const CAN_ASSIGN = ['vendor', 'shop_manager']

const DEMO_STAFF = [
  { id: 'u1', name: 'Tatenda Chikwanda', role: 'shop_manager' },
  { id: 'u2', name: 'Farai Ncube',       role: 'supervisor' },
  { id: 'u3', name: 'Grace Kamau',       role: 'cashier' },
  { id: 'u4', name: 'Chipo Banda',       role: 'shop_assistant' },
  { id: 'u5', name: 'Admire Moyo',       role: 'vendor' },
]

const INITIAL_TASKS = [
  {
    id: 1, title: 'Restock beverages section', description: 'Ensure all shelf slots are filled before 9am',
    assigneeId: 'u3', assigneeName: 'Grace Kamau', assignedById: 'u1', assignedByName: 'Tatenda Chikwanda',
    deadline: '2026-07-02', status: 'in_progress', priority: 'high', proofs: [],
    acceptedAt: '2026-07-01T08:00:00', notes: 'Checked coolers already',
  },
  {
    id: 2, title: 'Update price tags — dairy section', description: '',
    assigneeId: 'u3', assigneeName: 'Grace Kamau', assignedById: 'u1', assignedByName: 'Tatenda Chikwanda',
    deadline: '2026-07-03', status: 'pending', priority: 'medium', proofs: [], acceptedAt: null, notes: '',
  },
  {
    id: 3, title: 'Clean and organise storeroom', description: 'Full inventory count afterward',
    assigneeId: 'u4', assigneeName: 'Chipo Banda', assignedById: 'u5', assignedByName: 'Admire Moyo',
    deadline: '2026-07-01', status: 'completed', priority: 'low', proofs: [{ name: 'storeroom_done.jpg', type: 'image', note: 'Before and after photos' }],
    acceptedAt: '2026-07-01T06:30:00', notes: 'Done by 10am',
  },
  {
    id: 4, title: 'Count inventory for audit', description: 'Full count — beverages, dry goods, household',
    assigneeId: 'u2', assigneeName: 'Farai Ncube', assignedById: 'u5', assignedByName: 'Admire Moyo',
    deadline: '2026-07-04', status: 'pending', priority: 'high', proofs: [], acceptedAt: null, notes: '',
  },
  {
    id: 5, title: 'Train new cashier on POS system', description: 'Go through checkout and end-of-day process',
    assigneeId: 'u3', assigneeName: 'Grace Kamau', assignedById: 'u1', assignedByName: 'Tatenda Chikwanda',
    deadline: '2026-07-05', status: 'in_progress', priority: 'medium', proofs: [], acceptedAt: '2026-07-01T09:15:00', notes: '',
  },
]

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

const STATUS_ICON = { pending: Clock, in_progress: AlertCircle, completed: CheckCircle }
const STATUS_COLORS = {
  pending: 'text-slate-400',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
}

const PROOF_MIME = '.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,image/*'

function fileIcon(type) {
  if (!type) return File
  if (type.startsWith('image')) return Image
  if (type.includes('pdf')) return FileText
  return File
}

function StaffPicker({ value, onChange, staffList }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const list = staffList && staffList.length > 0 ? staffList : DEMO_STAFF
  const filtered = list.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.role.toLowerCase().includes(search.toLowerCase())
  )
  const selected = list.find((s) => s.id === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800"
      >
        <span className={selected ? 'text-slate-900 dark:text-white' : 'text-slate-400'}>
          {selected ? selected.name : 'Select staff member…'}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff…"
                className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none dark:text-white"
              />
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onChange(s.id, s.name); setOpen(false); setSearch('') }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                    {s.name[0]}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-slate-800 dark:text-white">{s.name}</div>
                    <div className="text-xs capitalize text-slate-400">{s.role.replace('_', ' ')}</div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No staff found</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ProofUploader({ proofs, onAdd }) {
  const fileRef = useRef(null)
  const [note, setNote] = useState('')

  const handleFiles = (files) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        onAdd({ id: Date.now(), name: file.name, type: file.type, data: e.target.result, note, size: file.size })
        setNote('')
      }
      reader.readAsDataURL(file)
    })
  }

  return (
    <div className="space-y-3">
      {proofs.map((p) => {
        const Icon = fileIcon(p.type)
        return (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800">
            <Icon className="h-5 w-5 flex-shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{p.name}</div>
              {p.note && <div className="text-xs text-slate-400">{p.note}</div>}
            </div>
            {p.type?.startsWith('image') && p.data && (
              <img src={p.data} alt="preview" className="h-10 w-10 rounded-lg object-cover" />
            )}
          </div>
        )
      })}
      <div className="flex gap-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note for this proof (optional)"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700"
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
        <input ref={fileRef} type="file" multiple accept={PROOF_MIME} className="hidden"
          onChange={(e) => handleFiles(e.target.files)} />
      </div>
    </div>
  )
}

function dbRowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    assigneeId: row.assigned_to || '',
    assigneeName: row['users!tasks_assigned_to_fkey']?.name || row.users?.name || 'Unknown',
    assignedById: row.created_by || '',
    assignedByName: row['users!tasks_created_by_fkey']?.name || 'Manager',
    deadline: row.due_date || '',
    status: row.status || 'pending',
    priority: row.priority || 'medium',
    proofs: [],
    acceptedAt: null,
    notes: '',
  }
}

export default function Tasks() {
  const { posMode } = useThemeStore()
  const { isDemo, role, profile, tenant, user } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const canAssign = CAN_ASSIGN.includes(role)

  const [tasks, setTasks] = useState(isDemo ? INITIAL_TASKS : [])
  const [staffList, setStaffList] = useState([])
  const [filter, setFilter] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const [updateTask, setUpdateTask] = useState(null)
  const [newTask, setNewTask] = useState({ title: '', description: '', assigneeId: '', assigneeName: '', deadline: '', priority: 'medium' })
  const [updateNote, setUpdateNote] = useState('')
  const [updateProofs, setUpdateProofs] = useState([])

  useEffect(() => {
    if (isDemo || !tenant?.id) return
    fetchTasks(tenant.id).then(rows => setTasks(rows.map(dbRowToTask))).catch(() => {})
    fetchStaff(tenant.id).then(rows => setStaffList(rows.map(r => ({ id: r.id, name: r.name, role: r.role })))).catch(() => {})
  }, [isDemo, tenant?.id])

  const myId = isDemo ? `demo-${role}` : (user?.id || '')

  const filteredTasks = tasks.filter((t) => {
    const passFilter = filter === 'all' ? true : t.status === filter
    if (canAssign) return passFilter
    return passFilter && t.assigneeId === myId
  })

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newTask.assigneeId) { toast.error('Select a staff member'); return }
    const optimistic = {
      id: Date.now(),
      title: newTask.title,
      description: newTask.description,
      assigneeId: newTask.assigneeId,
      assigneeName: newTask.assigneeName,
      assignedById: myId,
      assignedByName: profile?.name || 'Manager',
      deadline: newTask.deadline,
      status: 'pending',
      priority: newTask.priority,
      proofs: [],
      acceptedAt: null,
      notes: '',
    }
    setTasks(prev => [...prev, optimistic])
    setNewTask({ title: '', description: '', assigneeId: '', assigneeName: '', deadline: '', priority: 'medium' })
    setShowNew(false)
    toast.success('Task assigned!')

    if (!isDemo && tenant?.id) {
      try {
        const created = await insertTask(tenant.id, myId, {
          assignedTo: newTask.assigneeId,
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
          dueDate: newTask.deadline || null,
        })
        setTasks(prev => prev.map(t => t.id === optimistic.id ? dbRowToTask(created) : t))
      } catch (err) {
        toast.error('Saved locally — sync error: ' + (err.message || ''))
      }
    }
  }

  const accept = async (id) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'in_progress', acceptedAt: new Date().toISOString() } : t))
    toast.success('Task accepted — get to it!')
    if (!isDemo) await updateTaskStatus(id, 'in_progress').catch(() => {})
  }

  const openUpdate = (task) => {
    setUpdateTask(task)
    setUpdateNote(task.notes || '')
    setUpdateProofs(task.proofs || [])
  }

  const submitUpdate = async () => {
    const nextStatus = updateNote || updateProofs.length > 0 ? 'in_progress' : updateTask.status
    setTasks(prev => prev.map(t =>
      t.id === updateTask.id
        ? { ...t, notes: updateNote, proofs: updateProofs, status: nextStatus }
        : t
    ))
    setUpdateTask(null)
    toast.success('Task updated')
    if (!isDemo) await updateTaskStatus(updateTask.id, nextStatus).catch(() => {})
  }

  const markComplete = async (id) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'completed' } : t))
    toast.success('Task completed!')
    if (!isDemo) await updateTaskStatus(id, 'completed').catch(() => {})
  }

  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    toast.success('Task removed')
    if (!isDemo) await dbDeleteTask(id).catch(() => {})
  }

  const accent = isRestaurant ? 'bg-green-600 hover:bg-green-700' : 'bg-brand-600 hover:bg-brand-700'

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Tasks</h1>
          <p className="text-sm text-slate-500">
            {canAssign ? 'Assign and track staff tasks' : 'Your assigned tasks'}
          </p>
        </div>
        {canAssign && (
          <button
            onClick={() => setShowNew(true)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white ${accent}`}
          >
            <Plus className="h-4 w-4" />
            Assign Task
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {['all', 'pending', 'in_progress', 'completed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${filter === f ? `${accent} text-white` : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'}`}
          >
            {f.replace('_', ' ')} ({tasks.filter(t => f === 'all' ? true : t.status === f).length})
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 dark:border-slate-700">
              <CheckCircle className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-medium text-slate-500">{canAssign ? 'No tasks yet — assign one to staff' : 'No tasks assigned to you'}</p>
            </div>
          ) : filteredTasks.map((task) => {
            const StatusIcon = STATUS_ICON[task.status] || Clock
            const isMyTask = !canAssign && task.assigneeId === myId
            const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed'

            return (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`rounded-2xl border bg-white p-4 dark:bg-slate-900 ${isOverdue ? 'border-red-200 dark:border-red-800' : 'border-slate-200 dark:border-slate-800'}`}
              >
                <div className="flex items-start gap-3">
                  <StatusIcon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${STATUS_COLORS[task.status]}`} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className={`text-sm font-semibold ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                          {task.title}
                        </h3>
                        {task.description && <p className="mt-0.5 text-xs text-slate-500">{task.description}</p>}
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PRIORITY_COLORS[task.priority]}`}>
                        {task.priority}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {canAssign ? task.assigneeName : `Assigned by ${task.assignedByName}`}
                      </span>
                      {task.deadline && (
                        <span className={`flex items-center gap-1 ${isOverdue ? 'font-bold text-red-500' : ''}`}>
                          <Calendar className="h-3 w-3" />
                          Due {task.deadline}
                          {isOverdue && ' — OVERDUE'}
                        </span>
                      )}
                      {task.proofs?.length > 0 && (
                        <span className="flex items-center gap-1 text-brand-600 dark:text-brand-400">
                          <Paperclip className="h-3 w-3" />
                          {task.proofs.length} proof{task.proofs.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {task.notes && (
                      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {task.notes}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {/* Assignees: accept if pending, update progress, mark complete */}
                      {!canAssign && isMyTask && task.status === 'pending' && (
                        <button onClick={() => accept(task.id)} className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
                          <CheckSquare className="h-3.5 w-3.5" />Accept
                        </button>
                      )}
                      {!canAssign && isMyTask && task.status === 'in_progress' && (
                        <>
                          <button onClick={() => openUpdate(task)} className="flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                            <Upload className="h-3.5 w-3.5" />Update Progress
                          </button>
                          <button onClick={() => markComplete(task.id)} className="flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">
                            <CheckCircle className="h-3.5 w-3.5" />Mark Done
                          </button>
                        </>
                      )}

                      {/* Managers: view proofs, delete */}
                      {canAssign && (
                        <>
                          {task.proofs?.length > 0 && (
                            <button onClick={() => openUpdate(task)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                              <Paperclip className="h-3.5 w-3.5" />View Proofs
                            </button>
                          )}
                          <button onClick={() => deleteTask(task.id)} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" />Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Assign Task Modal */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Assign Task">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Task Title *</label>
            <input
              required
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              placeholder="e.g. Restock shelf 3"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Description</label>
            <textarea
              rows={2}
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              placeholder="Additional instructions…"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Assign To *</label>
            <StaffPicker
              staffList={staffList}
              value={newTask.assigneeId}
              onChange={(id, name) => setNewTask({ ...newTask, assigneeId: id, assigneeName: name })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Deadline</label>
              <input
                type="date"
                value={newTask.deadline}
                onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Priority</label>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowNew(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">Cancel</button>
            <button type="submit" className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white ${accent}`}>
              <Send className="h-4 w-4" />Assign Task
            </button>
          </div>
        </form>
      </Modal>

      {/* Update / Proof Modal */}
      {updateTask && (
        <Modal isOpen={true} onClose={() => setUpdateTask(null)} title={canAssign ? 'Task Proofs' : 'Update Progress'}>
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-sm font-bold text-slate-900 dark:text-white">{updateTask.title}</p>
              <p className="text-xs text-slate-500">Assigned to {updateTask.assigneeName}</p>
            </div>

            {!canAssign && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Progress Notes</label>
                <textarea
                  rows={3}
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                  placeholder="What have you done so far?"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Proof Attachments
                <span className="ml-2 font-normal text-slate-400">(image, PDF, Word, CSV, Excel)</span>
              </label>
              <ProofUploader
                proofs={updateProofs}
                onAdd={(proof) => setUpdateProofs((prev) => [...prev, proof])}
              />
            </div>

            {!canAssign && (
              <div className="flex gap-3 pt-1">
                <button onClick={() => setUpdateTask(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">Cancel</button>
                <button onClick={submitUpdate} className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white ${accent}`}>
                  <Send className="h-4 w-4" />Submit Update
                </button>
              </div>
            )}

            {canAssign && (
              <button onClick={() => setUpdateTask(null)} className={`w-full rounded-xl py-2.5 text-sm font-bold text-white ${accent}`}>
                Close
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
