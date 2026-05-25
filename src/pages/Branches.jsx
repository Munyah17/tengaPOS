import { motion } from 'framer-motion'
import { Store, MapPin, Users, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/utils/formatters'

const branches = [
  { id: 1, name: 'Main Branch', location: 'Harare CBD', staff: 5, revenue: 45200, status: 'active' },
  { id: 2, name: 'CBD Branch', location: 'Sam Levy Village', staff: 3, revenue: 32100, status: 'active' },
  { id: 3, name: 'Mall Branch', location: 'Eastgate Mall', staff: 4, revenue: 28400, status: 'active' },
]

export default function Branches() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Branches</h1>
        <p className="text-sm text-slate-500">Manage your business locations</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((branch, i) => (
          <motion.div
            key={branch.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-brand-100 p-2.5 dark:bg-brand-900">
                <Store className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white">{branch.name}</h3>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" /> {branch.location}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <Users className="mb-1 h-4 w-4 text-slate-400" />
                <div className="text-lg font-bold text-slate-900 dark:text-white">{branch.staff}</div>
                <div className="text-xs text-slate-500">Staff</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <DollarSign className="mb-1 h-4 w-4 text-slate-400" />
                <div className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(branch.revenue)}</div>
                <div className="text-xs text-slate-500">Revenue</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
