import { useState, useRef, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Bell, Menu, User, Settings, LogOut, ChevronDown } from 'lucide-react'
import AdminSidebar from './AdminSidebar'
import ThemeToggle from '@/components/common/ThemeToggle'
import RefreshOnlineButton from '@/components/common/RefreshOnlineButton'
import { useAuthStore } from '@/stores/authStore'

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', tech_support: 'Tech Support' }
const ROLE_COLOR = {
  super_admin: 'text-red-600 dark:text-red-400',
  admin: 'text-indigo-600 dark:text-indigo-400',
  tech_support: 'text-orange-600 dark:text-orange-400',
}

export default function AdminLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const navigate = useNavigate()
  const { profile, role, clearAuth } = useAuthStore()
  const displayName = profile?.name || 'Admin'
  const initial = displayName[0]?.toUpperCase() || 'A'

  const base = role === 'super_admin' ? '/admin/super' : '/admin'
  const settingsPath = role === 'super_admin' ? `${base}/settings` : '/admin/profile'
  const notificationsPath = `${base}/notifications`

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const go = (path) => {
    setMenuOpen(false)
    navigate(path)
  }

  const signOut = async () => {
    setMenuOpen(false)
    // Staff return to their own portal's sign-in, not the public site
    const dest = role === 'super_admin' ? '/super-admin' : '/admin/login'
    await clearAuth()
    navigate(dest)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <AdminSidebar open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 flex-shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 dark:border-white/10 dark:bg-slate-950 sm:px-4">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="ml-auto flex flex-shrink-0 items-center gap-1 sm:gap-2">
            <RefreshOnlineButton />
            <ThemeToggle />
            <button
              onClick={() => navigate(notificationsPath)}
              title="Notifications"
              className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500" />
            </button>

            {/* Avatar dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 text-sm font-bold text-white">
                  {initial}
                </div>
                <div className="hidden flex-col items-start md:flex">
                  <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-white">{displayName}</span>
                  <span className={`text-xs font-medium ${ROLE_COLOR[role] || 'text-slate-500'}`}>
                    {ROLE_LABEL[role] || role}
                  </span>
                </div>
                <ChevronDown className={`hidden h-4 w-4 text-slate-400 transition-transform md:block ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-white/5">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{displayName}</p>
                    <p className={`text-xs font-medium ${ROLE_COLOR[role] || 'text-slate-500'}`}>{ROLE_LABEL[role] || role}</p>
                  </div>
                  <div className="py-1">
                    <button onClick={() => go(settingsPath)} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5">
                      <User className="h-4 w-4 text-slate-400" /> Profile
                    </button>
                    <button onClick={() => go(notificationsPath)} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5">
                      <Bell className="h-4 w-4 text-slate-400" /> Notifications
                    </button>
                    <button onClick={() => go(settingsPath)} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5">
                      <Settings className="h-4 w-4 text-slate-400" /> Settings
                    </button>
                  </div>
                  <div className="border-t border-slate-100 py-1 dark:border-white/5">
                    <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 dark:bg-slate-900">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
