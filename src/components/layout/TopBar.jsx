import { Bell, Search, Wifi, WifiOff, ShieldAlert, Menu, User, Settings, LogOut, ChevronDown, CheckCheck, BellOff, ShoppingBag, UtensilsCrossed, AlertTriangle } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore, ROLE_COLORS, ROLE_LABELS } from '@/stores/authStore'
import { useFiscalStore } from '@/stores/fiscalStore'

const SAMPLE_NOTIFICATIONS = [
  { id: 1, text: 'Table 4 order ready to serve', time: '2m ago', unread: true },
  { id: 2, text: 'Low stock: Sadza (3 portions left)', time: '15m ago', unread: true },
  { id: 3, text: 'ORD-006 marked as cooking', time: '22m ago', unread: false },
]

function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => { if (ref.current && !ref.current.contains(e.target)) handler() }
    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)
    return () => { document.removeEventListener('mousedown', listener); document.removeEventListener('touchstart', listener) }
  }, [ref, handler])
}

export default function TopBar({ onMenuClick }) {
  const { posMode, setPosMode } = useThemeStore()
  const { profile, role, clearAuth } = useAuthStore()
  const { fiscalDayStatus, isEnabled: fiscalEnabled } = useFiscalStore()
  const navigate = useNavigate()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [bellOpen, setBellOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [notifications, setNotifications] = useState(SAMPLE_NOTIFICATIONS)
  const [showFiscalWarning, setShowFiscalWarning] = useState(false)
  const bellRef = useRef(null)
  const avatarRef = useRef(null)

  const isRestaurant = posMode === 'restaurant'
  const isReadOnly = role === 'tech_support'
  const displayName = profile?.name || 'User'
  const initial = displayName[0]?.toUpperCase() || 'U'
  const roleLabel = ROLE_LABELS[role] || role
  const colors = ROLE_COLORS[role] || ROLE_COLORS.vendor
  const unreadCount = notifications.filter((n) => n.unread).length

  useClickOutside(bellRef, () => setBellOpen(false))
  useClickOutside(avatarRef, () => setAvatarOpen(false))

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const markAllRead = () => setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })))

  const handleSignOut = async () => {
    setAvatarOpen(false)
    // Warn if fiscal day is open
    if (fiscalEnabled && fiscalDayStatus === 'open') {
      setShowFiscalWarning(true)
      return
    }
    await clearAuth()
    navigate('/')
  }

  const confirmSignOut = async () => {
    setShowFiscalWarning(false)
    await clearAuth()
    navigate('/')
  }

  return (
    <>
    <header className="relative flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="mr-3 rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Search — hidden on mobile */}
      <div className="hidden flex-1 items-center gap-3 md:flex">
        <div className="relative max-w-xs flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
          />
        </div>
      </div>

      {/* Spacer on mobile so right items stay right */}
      <div className="flex-1 md:hidden" />

      {/* Right */}
      <div className="flex items-center gap-1.5">
        {/* Read-only badge */}
        {isReadOnly && (
          <div className="hidden items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400 sm:flex">
            <ShieldAlert className="h-3.5 w-3.5" />
            Read-only
          </div>
        )}

        {/* Online status */}
        <div className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium sm:flex ${isOnline ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'}`}>
          {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* POS mode toggle — hidden on mobile */}
        <div className="hidden items-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 sm:flex">
          <button onClick={() => setPosMode('retail')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${posMode === 'retail' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            Retail
          </button>
          <button onClick={() => setPosMode('restaurant')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${posMode === 'restaurant' ? 'bg-green-600 text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            Restaurant
          </button>
        </div>

        <ThemeToggle />

        {/* Bell dropdown */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => { setBellOpen((o) => !o); setAvatarOpen(false) }}
            className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <span className="text-sm font-bold text-slate-900 dark:text-white">Notifications</span>
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400">
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                    <BellOff className="h-8 w-8 opacity-30" />
                    <span className="text-sm">No notifications</span>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${n.unread ? 'bg-brand-50/50 dark:bg-brand-950/20' : ''}`}>
                      {n.unread && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" />}
                      {!n.unread && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-transparent" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 dark:text-slate-200">{n.text}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{n.time}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Avatar dropdown */}
        <div ref={avatarRef} className="relative">
          <button
            onClick={() => { setAvatarOpen((o) => !o); setBellOpen(false) }}
            className="flex items-center gap-2 rounded-xl p-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${isRestaurant ? 'from-green-500 to-green-700' : 'from-brand-500 to-brand-700'} text-sm font-bold text-white`}>
              {initial}
            </div>
            <div className="hidden flex-col text-left sm:flex">
              <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-white">{displayName}</span>
              <span className={`text-xs font-medium ${colors.text}`}>{roleLabel}</span>
            </div>
            <ChevronDown className={`hidden h-3.5 w-3.5 flex-shrink-0 text-slate-400 transition-transform sm:block ${avatarOpen ? 'rotate-180' : ''}`} />
          </button>

          {avatarOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
              {/* Header */}
              <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{displayName}</p>
                <p className={`text-xs font-medium ${colors.text}`}>{roleLabel}</p>
              </div>

              {/* Mode switcher — always visible, primary way to switch on mobile */}
              <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
                <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">POS Mode</p>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => { setPosMode('retail'); setAvatarOpen(false) }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                      posMode === 'retail'
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    Retail
                  </button>
                  <button
                    onClick={() => { setPosMode('restaurant'); setAvatarOpen(false) }}
                    className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                      posMode === 'restaurant'
                        ? 'bg-green-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    <UtensilsCrossed className="h-3.5 w-3.5" />
                    Restaurant
                  </button>
                </div>
              </div>

              {/* Links */}
              <div className="py-1">
                <button
                  onClick={() => { setAvatarOpen(false); navigate('/app/settings') }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <User className="h-4 w-4 text-slate-400" />
                  Profile
                </button>
                <button
                  onClick={() => { setAvatarOpen(false); navigate('/app/settings') }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Settings className="h-4 w-4 text-slate-400" />
                  Settings
                </button>
              </div>
              <div className="border-t border-slate-100 py-1 dark:border-slate-800">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

    {/* Fiscal day open warning modal */}
    {showFiscalWarning && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-amber-100 p-2 dark:bg-amber-900/40">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Fiscal Day Still Open</h3>
              <p className="text-xs text-slate-500">Close the fiscal day before signing out</p>
            </div>
          </div>
          <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
            Your ZIMRA fiscal day is still open. You should close it before signing out to ensure your fiscal records are complete. You can close it in <strong>Fiscalisation</strong>.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowFiscalWarning(false); navigate('/app/fiscalisation') }}
              className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
            >
              Go to Fiscalisation
            </button>
            <button
              onClick={confirmSignOut}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Sign Out Anyway
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
