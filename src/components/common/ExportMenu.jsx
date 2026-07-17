import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, FileSpreadsheet, FileText, Database } from 'lucide-react'
import { exportToCSV, exportToExcel, exportToPDF, exportToAccess } from '@/utils/exportUtils'
import { useAuthStore } from '@/stores/authStore'

export default function ExportMenu({ data, columns, title, filename }) {
  const [open, setOpen] = useState(false)
  const { tenant } = useAuthStore()
  const brandColor = tenant?.whitelabel?.enabled ? tenant.whitelabel.primary_color : null

  const options = [
    { label: 'CSV', icon: FileText, action: () => exportToCSV(data, filename) },
    { label: 'Excel', icon: FileSpreadsheet, action: () => exportToExcel(data, filename) },
    { label: 'PDF', icon: FileText, action: () => exportToPDF(data, columns, title, filename, brandColor) },
    { label: 'Access', icon: Database, action: () => exportToAccess(data, filename) },
  ]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <Download className="h-4 w-4" />
        Export
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            {options.map((opt) => (
              <button
                key={opt.label}
                onClick={() => { opt.action(); setOpen(false) }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
