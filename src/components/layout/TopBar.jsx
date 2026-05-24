import { Bell, Search, Wifi, WifiOff } from 'lucide-react'
import { useState, useEffect } from 'react'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'

export default function TopBar() {
  const { posMode, setPosMode } = useThemeStore()
  const { profile } = useAuthStore()
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-950">
      {/* Search */}
      <div className="flex flex-1 items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Online indicator */}
        <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
          isOnline
            ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
        }`}>
          {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {isOnline ? 'Online' : 'Offline'}
        </div>

        {/* POS Mode Toggle */}
        <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setPosMode('retail')}
            className={`rounded-l-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              posMode === 'retail'
                ? 'bg-brand-600 text-white'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Retail
          </button>
          <button
            onClick={() => setPosMode('restaurant')}
            className={`rounded-r-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              posMode === 'restaurant'
                ? 'bg-restaurant-600 text-white'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Restaurant
          </button>
        </div>

        <ThemeToggle />

        {/* Notifications */}
        <button className="relative rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {profile?.name?.[0] || 'D'}
          </div>
        </div>
      </div>
    </header>
  )
}
