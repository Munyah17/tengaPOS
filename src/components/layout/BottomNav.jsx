import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, ClipboardList, BarChart3, Package, Users, ListTodo,
} from 'lucide-react'
import { useAuthStore, NAV_PERMISSIONS } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'

// Same icon/label/path choices as Sidebar.jsx's ALL_NAV_ITEMS, kept as its
// own small map here rather than importing that one -- Sidebar's list is
// full-width and includes every mode-specific/add-on page; this is
// deliberately a curated top-4, not a mobile mirror of the whole sidebar
// (the hamburger drawer still covers everything else).
const ITEM_DEFS = {
  dashboard: { icon: LayoutDashboard, label: 'Dashboard', path: '/app/dashboard' },
  pos: { icon: ShoppingCart, label: 'POS', path: '/app/pos' },
  orders: { icon: ClipboardList, label: 'Orders', path: '/app/orders' },
  reports: { icon: BarChart3, label: 'Reports', path: '/app/reports' },
  inventory: { icon: Package, label: 'Products', path: '/app/inventory' },
  staff: { icon: Users, label: 'Staff', path: '/app/staff' },
  tasks: { icon: ListTodo, label: 'Tasks', path: '/app/tasks' },
}

// Ranked by how often a role actually reaches for it -- each role's bar is
// the first 4 of these it's actually allowed to see (NAV_PERMISSIONS),
// so it degrades gracefully instead of needing a hand-written list per role.
const PRIORITY = ['dashboard', 'pos', 'orders', 'reports', 'inventory', 'staff', 'tasks']

export default function BottomNav() {
  const { role } = useAuthStore()
  const { posMode } = useThemeStore()
  const allowedKeys = NAV_PERMISSIONS[role] || NAV_PERMISSIONS.vendor
  const items = PRIORITY.filter((key) => allowedKeys.includes(key)).slice(0, 4).map((key) => ITEM_DEFS[key])

  if (items.length === 0) return null

  const activeColor = posMode === 'restaurant' ? 'text-green-600 dark:text-green-400' : 'text-brand-600 dark:text-brand-400'

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95 lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
              isActive ? activeColor : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
