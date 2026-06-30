import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, CheckCircle, Clock, AlertCircle, User } from 'lucide-react'
import Button from '@/components/common/Button'
import Modal from '@/components/common/Modal'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'

const initialTasks = [
  { id: 1, title: 'Restock beverages section', assignee: 'Tatenda M.', deadline: '2026-05-25', status: 'in_progress', priority: 'high' },
  { id: 2, title: 'Update price tags for dairy products', assignee: 'Grace K.', deadline: '2026-05-26', status: 'pending', priority: 'medium' },
  { id: 3, title: 'Clean and organize storeroom', assignee: 'Farai N.', deadline: '2026-05-24', status: 'completed', priority: 'low' },
  { id: 4, title: 'Count inventory for audit', assignee: 'Tatenda M.', deadline: '2026-05-27', status: 'pending', priority: 'high' },
  { id: 5, title: 'Train new cashier on POS system', assignee: 'Grace K.', deadline: '2026-05-28', status: 'in_progress', priority: 'medium' },
]

const priorityColors = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  low: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
}

const statusIcons = {
  pending: Clock,
  in_progress: AlertCircle,
  completed: CheckCircle,
}

export default function Tasks() {
  const { posMode } = useThemeStore()
  const { isDemo } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const [tasks, setTasks] = useState(isDemo ? initialTasks : [])
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('all')
  const [newTask, setNewTask] = useState({ title: '', assignee: '', deadline: '', priority: 'medium' })

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)

  const handleAdd = (e) => {
    e.preventDefault()
    setTasks([...tasks, { ...newTask, id: Date.now(), status: 'pending' }])
    setShowAdd(false)
    setNewTask({ title: '', assignee: '', deadline: '', priority: 'medium' })
  }

  const cycleStatus = (id) => {
    const flow = ['pending', 'in_progress', 'completed']
    setTasks(tasks.map((t) => {
      if (t.id !== id) return t
      const idx = flow.indexOf(t.status)
      return { ...t, status: flow[(idx + 1) % flow.length] }
    }))
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Task Management</h1>
          <p className="text-sm text-slate-500">Assign and track staff tasks</p>
        </div>
        <Button variant={isRestaurant ? 'restaurant' : 'primary'} onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        {['all', 'pending', 'in_progress', 'completed'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              filter === f
                ? isRestaurant ? 'bg-restaurant-600 text-white' : 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-3">
        <AnimatePresence>
          {filtered.map((task) => {
            const StatusIcon = statusIcons[task.status]
            return (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => cycleStatus(task.id)}
                      className={`mt-0.5 rounded-full p-1 ${
                        task.status === 'completed'
                          ? 'text-green-500'
                          : task.status === 'in_progress'
                          ? 'text-blue-500'
                          : 'text-slate-400'
                      }`}
                    >
                      <StatusIcon className="h-5 w-5" />
                    </button>
                    <div>
                      <h3 className={`text-sm font-semibold ${
                        task.status === 'completed'
                          ? 'text-slate-400 line-through'
                          : 'text-slate-900 dark:text-white'
                      }`}>
                        {task.title}
                      </h3>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {task.assignee}
                        </span>
                        <span>Due: {task.deadline}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${priorityColors[task.priority]}`}>
                    {task.priority}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Add Task Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Task">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Task Title</label>
            <input
              type="text"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Assign To</label>
            <input
              type="text"
              value={newTask.assignee}
              onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Deadline</label>
            <input
              type="date"
              value={newTask.deadline}
              onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Priority</label>
            <select
              value={newTask.priority}
              onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit">Create Task</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
