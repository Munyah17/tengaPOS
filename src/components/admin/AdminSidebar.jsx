import { NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Building2, Users, LifeBuoy, BarChart3,
  Settings, LogOut, Shield, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import posLogo from '@/assets/pos-logo.png'
import posIcon from '@/assets/pos-icon.png'

const ROLE_BADGE = {
  super_admin: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Super Admin' },
  admin: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-400', label: 'Admin' },
  tech_support: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', label: 'Tech Support' },
}

const NAV_BY_ROLE = {
  super_admin: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: Building2, label: 'Tenants', path: '/admin/tenants' },
    { icon: Users, label: 'Staff', path: '/admin/staff' },
    { icon: LifeBuoy, label: 'Support', path: '/admin/support' },
    { icon: BarChart3, label: 'Reports', path: '/admin/reports' },
    { icon: Settings, label: 'Settings', path: '/admin/settings' },
  ],
  admin: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: Building2, label: 'Tenants', path: '/admin/tenants' },
    { icon: Users, label: 'Staff', path: '/admin/staff' },
    { icon: LifeBuoy, label: 'Support', path: '/admin/support' },
    { icon: BarChart3, label: 'Reports', path: '/admin/reports' },
  ],
  tech_support: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: Building2, label: 'Clients', path: '/admin/tenants' },
    { icon: LifeBuoy, label: 'Support', path: '/admin/support' },
  ],
}

export default function AdminSidebar({ open = false, onClose }) {
  const [collapsed, setCollapsed] = useState(false)
  const { clearAuth, role, profile } = useAuthStore()
  const navigate = useNavigate()

  const navItems = NAV_BY_ROLE[role] || NAV_BY_ROLE.tech_support
  const badge = ROLE_BADGE[role] || ROLE_BADGE.tech_support
  const displayName = profile?.name || 'Admin'
  const initial = displayName[0]?.toUpperCase() || 'A'

  const handleSignOut = async () => {
    await clearAuth()
    navigate('/')
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        className={[
          'fixed top-0 left-0 h-full z-50',
          'lg:static lg:h-screen lg:z-auto',
          collapsed ? 'w-[72px]' : 'w-64',
          'flex flex-col flex-shrink-0',
          'border-r border-slate-200 bg-slate-950 dark:border-slate-800',
          'transition-all duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-white/10 px-3">
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                key="logo"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-2"
              >
                <img src={posIcon} alt="tengaPOS" className="h-7 w-auto" />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Admin</span>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/10 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto hidden rounded-lg p-1.5 text-slate-400 hover:bg-white/10 lg:block"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Profile */}
        <div className="flex-shrink-0 border-b border-white/10 p-3">
          <div className={`flex ${collapsed ? 'justify-center' : 'items-center gap-3'}`}>
            <div
              className={`flex flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-700 font-bold text-white ${
                collapsed ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'
              }`}
            >
              {initial}
            </div>
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="overflow-hidden"
                >
                  <div className="truncate text-sm font-semibold text-white">{displayName}</div>
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Platform label */}
        {!collapsed && (
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
            <Shield className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Platform Control</span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-400'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`
                }
                title={collapsed ? item.label : undefined}
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    <AnimatePresence mode="wait">
                      {!collapsed && (
                        <motion.span
                          key="label"
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: 'auto' }}
                          exit={{ opacity: 0, width: 0 }}
                          className="truncate"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Sign out */}
        <div className="flex-shrink-0 border-t border-white/10 p-3">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-red-950/50 hover:text-red-400"
            title={collapsed ? 'Sign Out' : undefined}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
