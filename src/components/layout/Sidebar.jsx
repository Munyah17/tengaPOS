import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, ShoppingCart, Package, ClipboardList, BarChart3,
  Settings, Users, ChefHat, ListTodo, LogOut, ChevronLeft, ChevronRight,
  Store, Receipt, Cpu,
} from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore, ROLE_COLORS, ROLE_LABELS, NAV_PERMISSIONS } from '@/stores/authStore'

const ALL_NAV_ITEMS = [
  { key: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', path: '/app/dashboard' },
  { key: 'pos', icon: ShoppingCart, label: 'POS', path: '/app/pos' },
  { key: 'inventory', icon: Package, label: 'Inventory', path: '/app/inventory' },
  { key: 'orders', icon: ClipboardList, label: 'Orders', path: '/app/orders' },
  { key: 'kitchen', icon: ChefHat, label: 'Kitchen', path: '/app/kitchen', restaurantOnly: true },
  { key: 'transactions', icon: Receipt, label: 'Transactions', path: '/app/transactions' },
  { key: 'reports', icon: BarChart3, label: 'Reports', path: '/app/reports' },
  { key: 'staff', icon: Users, label: 'Staff Management', path: '/app/staff' },
  { key: 'tasks', icon: ListTodo, label: 'Tasks', path: '/app/tasks' },
  { key: 'branches', icon: Store, label: 'Branches', path: '/app/branches' },
  { key: 'fiscalisation', icon: Cpu, label: 'Fiscalisation', path: '/app/fiscalisation' },
  { key: 'settings', icon: Settings, label: 'Settings', path: '/app/settings' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { posMode } = useThemeStore()
  const { clearAuth, role, profile } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const isRestaurant = posMode === 'restaurant'

  const allowedKeys = NAV_PERMISSIONS[role] || NAV_PERMISSIONS.vendor
  const visibleItems = ALL_NAV_ITEMS.filter((item) => {
    if (!allowedKeys.includes(item.key)) return false
    if (item.restaurantOnly && !isRestaurant) return false
    return true
  })

  const colors = ROLE_COLORS[role] || ROLE_COLORS.vendor
  const roleLabel = ROLE_LABELS[role] || role
  const displayName = profile?.name || 'User'
  const initial = displayName[0]?.toUpperCase() || 'U'

  const handleSignOut = () => {
    clearAuth()
    navigate('/')
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ duration: 0.2 }}
      className="flex h-screen flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
    >
      {/* Logo + collapse */}
      <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <div
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${
                  isRestaurant ? 'from-green-500 to-green-700' : 'from-brand-500 to-brand-700'
                } text-xs font-extrabold text-white`}
              >
                tP
              </div>
              <span className="font-extrabold text-slate-900 dark:text-white">
                tenga
                <span className={isRestaurant ? 'text-green-500' : 'text-brand-500'}>POS</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* User profile */}
      <div className={`flex-shrink-0 border-b border-slate-200 p-3 dark:border-slate-800 ${collapsed ? 'items-center' : ''}`}>
        <div className={`flex ${collapsed ? 'justify-center' : 'items-center gap-3'}`}>
          <div
            className={`flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white ${
              collapsed ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'
            } bg-gradient-to-br ${
              isRestaurant ? 'from-green-500 to-green-700' : 'from-brand-500 to-brand-700'
            }`}
          >
            {initial}
          </div>
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden"
              >
                <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {displayName}
                </div>
                <span
                  className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${colors.bg} ${colors.text}`}
                >
                  {roleLabel}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-0.5">
          {visibleItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? isRestaurant
                      ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
                      : 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon
                  className={`h-5 w-5 flex-shrink-0 ${
                    isActive
                      ? isRestaurant
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-brand-600 dark:text-brand-400'
                      : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                  }`}
                />
                <AnimatePresence mode="wait">
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="truncate"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            )
          })}
        </div>
      </nav>

      {/* Sign out */}
      <div className="flex-shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950 dark:hover:text-red-400"
          title={collapsed ? 'Sign Out' : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </motion.aside>
  )
}
