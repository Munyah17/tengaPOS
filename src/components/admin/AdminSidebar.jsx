import { NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Building2, Users, LifeBuoy, BarChart3,
  Settings, LogOut, Shield, X, ChevronLeft, ChevronRight, Bell,
  DollarSign, Tag, Database, Activity, Mail, Lock, Eye, Megaphone,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import posIcon from '@/assets/pos-icon.png'

// Helper to render grouped navigation (Super Admin)
function renderGroupedNav(items, collapsed, unread, onClose) {
  const grouped = {}
  items.forEach(item => {
    const group = item.group || 'OTHER'
    if (!grouped[group]) grouped[group] = []
    grouped[group].push(item)
  })

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([groupName, groupItems]) => (
        <div key={groupName}>
          {!collapsed && (
            <div className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {groupName}
            </div>
          )}
          <div className="space-y-0.5">
            {groupItems.map((item) => renderNavItem(item, collapsed, unread, onClose))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Helper to render single nav item
function renderNavItem(item, collapsed, unread, onClose) {
  return (
    <NavLink
      key={item.path}
      to={item.path}
      onClick={onClose}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
          isActive
            ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-600/20 dark:text-indigo-400'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
        }`
      }
      title={collapsed ? item.label : undefined}
    >
      {({ isActive }) => (
        <>
          <div className="relative flex-shrink-0">
            <item.icon className={`h-5 w-5 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`} />
            {item.badge && unread > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
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
  )
}

const ROLE_BADGE = {
  super_admin: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Super Admin' },
  admin: { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-400', label: 'Admin' },
  tech_support: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', label: 'Tech Support' },
}

const NAV_BY_ROLE = {
  super_admin: [
    // OVERVIEW
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/super/dashboard', group: 'OVERVIEW' },
    { icon: Bell, label: 'Notifications', path: '/admin/super/notifications', group: 'OVERVIEW', badge: true },
    { icon: Activity, label: 'System Health', path: '/admin/super/health', group: 'OVERVIEW' },

    // TENANT MANAGEMENT
    { icon: Building2, label: 'All Tenants', path: '/admin/super/tenants', group: 'TENANTS' },
    { icon: Users, label: 'User Management', path: '/admin/super/users', group: 'TENANTS' },
    { icon: Eye, label: 'Fiscal Requests', path: '/admin/super/fiscal-requests', group: 'TENANTS' },
    { icon: DollarSign, label: 'Subscriptions', path: '/admin/super/subscriptions', group: 'TENANTS' },
    { icon: BarChart3, label: 'Billing & Revenue', path: '/admin/super/billing', group: 'TENANTS' },
    { icon: Tag, label: 'Pricing Tiers', path: '/admin/super/pricing', group: 'TENANTS' },

    // STAFF MANAGEMENT
    { icon: Users, label: 'Staff Management', path: '/admin/super/staff', group: 'STAFF' },
    { icon: Lock, label: 'Roles & Permissions', path: '/admin/super/roles', group: 'STAFF' },

    // COMMUNICATIONS
    { icon: Megaphone, label: 'Announcements', path: '/admin/super/announcements', group: 'COMMS' },
    { icon: Mail, label: 'Email Broadcasts', path: '/admin/super/broadcasts', group: 'COMMS' },

    // SUPPORT
    { icon: LifeBuoy, label: 'Support Tickets', path: '/admin/super/support', group: 'SUPPORT' },

    // COMPLIANCE
    { icon: Shield, label: 'Audit Logs', path: '/admin/super/audit-logs', group: 'COMPLIANCE' },
    { icon: Eye, label: 'ZIMRA Compliance', path: '/admin/super/compliance', group: 'COMPLIANCE' },

    // SYSTEM
    { icon: Database, label: 'Backups & Recovery', path: '/admin/super/backups', group: 'SYSTEM' },
    { icon: Settings, label: 'System Settings', path: '/admin/super/settings', group: 'SYSTEM' },
  ],

  admin: [
    // LIMITED TO OPERATIONS ONLY
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard', group: 'OPERATIONS' },
    { icon: Users, label: 'User Management', path: '/admin/users', group: 'OPERATIONS' },
    { icon: Eye, label: 'Fiscal Requests', path: '/admin/fiscal-requests', group: 'OPERATIONS' },
    { icon: LifeBuoy, label: 'Support Tickets', path: '/admin/support', group: 'OPERATIONS' },
    { icon: Bell, label: 'Notifications', path: '/admin/notifications', group: 'OPERATIONS', badge: true },
    { icon: Megaphone, label: 'Send Announcement', path: '/admin/announcements', group: 'COMMS' },
    { icon: Tag, label: 'Announcement Popup', path: '/admin/pricing', group: 'COMMS' },
    { icon: Eye, label: 'Reports (View Only)', path: '/admin/reports', group: 'REPORTS', readonly: true },
    { icon: Settings, label: 'Profile Settings', path: '/admin/profile', group: 'ACCOUNT' },
  ],

  tech_support: [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard', group: 'SUPPORT' },
    { icon: LifeBuoy, label: 'Support Tickets', path: '/admin/support', group: 'SUPPORT' },
  ],
}

export default function AdminSidebar({ open = false, onClose }) {
  const [collapsed, setCollapsed] = useState(false)
  const [unread, setUnread] = useState(0)
  const { clearAuth, role, profile } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('admin_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .then(({ count }) => setUnread(count || 0))
  }, [])

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
          'border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950',
          'transition-all duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 px-3 dark:border-white/10">
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
            className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 lg:block"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Profile */}
        <div className="flex-shrink-0 border-b border-slate-200 p-3 dark:border-white/10">
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
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{displayName}</div>
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
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-white/10">
            <Shield className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Platform Control</span>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {role === 'super_admin' ? (
            // GROUPED NAVIGATION FOR SUPER ADMIN
            renderGroupedNav(navItems, collapsed, unread, onClose)
          ) : (
            // SIMPLE LIST FOR ADMIN/TECH_SUPPORT
            <div className="space-y-0.5">
              {navItems.map((item) => renderNavItem(item, collapsed, unread, onClose))}
            </div>
          )}
        </nav>

        {/* Sign out */}
        <div className="flex-shrink-0 border-t border-slate-200 p-3 dark:border-white/10">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
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
