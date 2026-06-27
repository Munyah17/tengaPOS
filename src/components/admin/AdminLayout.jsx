import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Bell, Search, Menu } from 'lucide-react'
import AdminSidebar from './AdminSidebar'
import ThemeToggle from '@/components/common/ThemeToggle'
import { useAuthStore } from '@/stores/authStore'

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', tech_support: 'Tech Support' }
const ROLE_COLOR = {
  super_admin: 'text-red-400',
  admin: 'text-indigo-400',
  tech_support: 'text-orange-400',
}

export default function AdminLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const { profile, role } = useAuthStore()
  const displayName = profile?.name || 'Admin'
  const initial = displayName[0]?.toUpperCase() || 'A'

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      <AdminSidebar open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Admin TopBar */}
        <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/10 bg-slate-950 px-4">
          {/* Hamburger — mobile */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="mr-3 rounded-xl p-2 text-slate-400 hover:bg-white/10 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Search */}
          <div className="flex flex-1 items-center">
            <div className="relative max-w-xs flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search tenants, users..."
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="relative rounded-xl p-2 text-slate-400 hover:bg-white/10">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-indigo-500" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 text-sm font-bold text-white">
                {initial}
              </div>
              <div className="hidden flex-col sm:flex">
                <span className="text-sm font-semibold leading-tight text-white">{displayName}</span>
                <span className={`text-xs font-medium ${ROLE_COLOR[role] || 'text-slate-400'}`}>
                  {ROLE_LABEL[role] || role}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-900">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
