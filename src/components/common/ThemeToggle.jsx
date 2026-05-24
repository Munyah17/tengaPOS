import { Sun, Moon } from 'lucide-react'
import { motion } from 'framer-motion'
import { useThemeStore } from '@/stores/themeStore'

export default function ThemeToggle({ className = '' }) {
  const { mode, toggleMode } = useThemeStore()

  return (
    <button
      onClick={toggleMode}
      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
        mode === 'dark' ? 'bg-slate-700' : 'bg-slate-200'
      } ${className}`}
      aria-label="Toggle theme"
    >
      <motion.div
        layout
        className="flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm"
        style={{ marginLeft: mode === 'dark' ? '28px' : '4px' }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {mode === 'dark' ? (
          <Moon className="h-3.5 w-3.5 text-slate-700" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-amber-500" />
        )}
      </motion.div>
    </button>
  )
}
