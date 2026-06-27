import { Bell, Search, Wifi, WifiOff, ShieldAlert } from 'lucide-react'
import { useState, useEffect } from 'react'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore, ROLE_COLORS, ROLE_LABELS } from '@/stores/authStore'

export default function TopBar() {
  const { posMode, setPosMode } = useThemeStore()
  const { profile, role } = useAuthStore()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const isRestaurant = posMode === 'restaurant'
  const isReadOnly = role === 'tech_support'

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const displayName = profile?.name || 'User'
  const initial = displayName[0]?.toUpperCase() || 'U'
  const roleLabel = ROLE_LABELS[role] || role
  const colors = ROLE_COLORS[role] || ROLE_COLORS.vendor

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
      {/* Search */}
      <div className="flex flex-1 items-center gap-3">
        <div className="relative max-w-xs flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Read-only badge */}
        {isReadOnly && (
          <div className="hidden items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400 sm:flex">
            <ShieldAlert className="h-3.5 w-3.5" />
            Read-only
          </div>
        )}

        {/* Online status */}
        <div
          className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium sm:flex ${
            isOnline
              ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
              : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
          }`}
        >
          {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {isOnline ? 'Online' : 'Offline'}
        </div>

        {/* POS mode toggle */}
        <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setPosMode('retail')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
              posMode === 'retail'
                ? 'bg-brand-600 text-white'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Retail
          </button>
          <button
            onClick={() => setPosMode('restaurant')}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
              posMode === 'restaurant'
                ? 'bg-green-600 text-white'
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

        {/* User avatar + name + role */}
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${
              isRestaurant ? 'from-green-500 to-green-700' : 'from-brand-500 to-brand-700'
            } text-sm font-bold text-white`}
          >
            {initial}
          </div>
          <div className="hidden flex-col sm:flex">
            <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-white">
              {displayName}
            </span>
            <span className={`text-xs font-medium ${colors.text}`}>{roleLabel}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
