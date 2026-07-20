import { Bell, CheckCheck, BellOff } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { useTenantNotifications } from '@/hooks/useTenantNotifications'

export default function Notifications() {
  const { tenant, role } = useAuthStore()
  const { posMode } = useThemeStore()
  const { notifications, markAllRead, markRead } = useTenantNotifications({
    tenantId: tenant?.id, posMode, role, limit: 100,
  })
  const unread = notifications.filter((n) => n.unread).length

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 self-start rounded-xl bg-brand-600/10 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-600/20 dark:text-brand-400"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <BellOff className="h-8 w-8 opacity-30" />
          <p className="text-sm">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = n.icon || Bell
            return (
              <button
                key={n.id}
                onClick={() => n.unread && markRead(n.id)}
                className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
                  n.unread
                    ? 'border-slate-200 bg-white dark:border-white/10 dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/8'
                    : 'border-slate-100 bg-slate-50 opacity-60 dark:border-white/5 dark:bg-white/[0.02]'
                }`}
              >
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
                  <Icon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{n.text}</span>
                    {n.unread && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" />}
                  </div>
                  {n.body && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400">{n.body}</p>}
                </div>
                <span className="flex-shrink-0 text-xs text-slate-400">{n.time}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
