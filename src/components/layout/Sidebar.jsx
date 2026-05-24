import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, ShoppingCart, Package, ClipboardList, BarChart3,
  Settings, Users, ChefHat, ListTodo, LogOut, ChevronLeft, ChevronRight,
  Store, Receipt,
} from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/app/dashboard' },
  { icon: ShoppingCart, label: 'POS', path: '/app/pos' },
  { icon: Package, label: 'Inventory', path: '/app/inventory' },
  { icon: ClipboardList, label: 'Orders', path: '/app/orders' },
  { icon: ChefHat, label: 'Kitchen', path: '/app/kitchen', restaurantOnly: true },
  { icon: Receipt, label: 'Transactions', path: '/app/transactions' },
  { icon: BarChart3, label: 'Reports', path: '/app/reports' },
  { icon: Users, label: 'Staff', path: '/app/staff' },
  { icon: ListTodo, label: 'Tasks', path: '/app/tasks' },
  { icon: Store, label: 'Branches', path: '/app/branches' },
  { icon: Settings, label: 'Settings', path: '/app/settings' },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const { posMode } = useThemeStore()
  const { clearAuth } = useAuthStore()
  const location = useLocation()
  const isRestaurant = posMode === 'restaurant'
  const accent = isRestaurant ? 'restaurant' : 'brand'

  const filteredItems = menuItems.filter(
    (item) => !item.restaurantOnly || isRestaurant
  )

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 256 }}
      className="flex h-screen flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${
                isRestaurant ? 'from-restaurant-500 to-restaurant-700' : 'from-brand-500 to-brand-700'
              } text-xs font-extrabold text-white`}>
                tP
              </div>
              <span className="font-extrabold text-slate-900 dark:text-white">
                tenga<span className={isRestaurant ? 'text-restaurant-500' : 'text-brand-500'}>POS</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {filteredItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? isRestaurant
                      ? 'bg-restaurant-50 text-restaurant-700 dark:bg-restaurant-950 dark:text-restaurant-400'
                      : 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-400'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <item.icon className={`h-5 w-5 flex-shrink-0 ${
                  isActive
                    ? isRestaurant ? 'text-restaurant-600 dark:text-restaurant-400' : 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                }`} />
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

      {/* Bottom */}
      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          onClick={clearAuth}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950 dark:hover:text-red-400"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </motion.aside>
  )
}
