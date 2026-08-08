import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DollarSign, ShoppingCart, TrendingUp, CalendarDays } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchMyDashboardMetrics } from '@/lib/db'
import { formatCurrency } from '@/utils/formatters'
import { withOfflineCache, seedFromOfflineCache } from '@/lib/offlineCache'

// A cut-down, account-scoped alternative to the full tenant Dashboard --
// cashiers/shop assistants shouldn't see tenant-wide revenue, everyone
// else's low-stock alerts, or staff counts (not theirs to see), but a
// "what did I personally sell" summary was requested as a genuinely
// helpful thing to glance at. Every number here is filtered to this one
// user's own processed transactions -- see fetchMyDashboardMetrics.
export default function MyDashboard() {
  const { posMode } = useThemeStore()
  const { profile, tenant, user } = useAuthStore()
  const accentColor = posMode === 'restaurant' ? '#22c55e' : posMode === 'workshop' ? '#dc2626' : '#3b82f6'
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!tenant?.id || !user?.id) return
    seedFromOfflineCache(queryClient, ['myDashboardMetrics', tenant.id, user.id])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id, user?.id])

  const { data: metrics = null } = useQuery({
    queryKey: ['myDashboardMetrics', tenant?.id, user?.id],
    queryFn: withOfflineCache(['myDashboardMetrics', tenant?.id, user?.id], () => fetchMyDashboardMetrics(tenant.id, user.id)),
    enabled: !!tenant?.id && !!user?.id,
    staleTime: 60000,
  })

  const statCards = [
    { label: 'My Sales Today', value: formatCurrency(metrics?.todayRevenue ?? 0), icon: DollarSign },
    { label: 'My Orders Today', value: String(metrics?.todayOrders ?? 0), icon: ShoppingCart },
    { label: 'My Sales This Week', value: formatCurrency(metrics?.weekRevenue ?? 0), icon: TrendingUp },
    { label: 'My Orders This Week', value: String(metrics?.weekOrders ?? 0), icon: CalendarDays },
  ]

  const weekData = metrics?.weekData ?? []
  const topProducts = metrics?.topProducts ?? []
  const recentTransactions = metrics?.recentTransactions?.map((t) => ({
    id: t.reference || t.id,
    time: new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    amount: parseFloat(t.amount),
    items: t.orders?.order_items?.reduce((s, i) => s + i.qty, 0) || 0,
    method: t.method,
  })) || []

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">My Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Welcome back, {profile?.name || 'there'} — here's a summary of your own sales
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.label}</span>
              <div className="rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 p-2 text-white">
                <card.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">{card.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2"
        >
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">My Sales This Week</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weekData}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
              <Bar dataKey="revenue" fill={accentColor} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <h3 className="font-bold text-slate-900 dark:text-white">Top Products I Sold</h3>
          </div>
          <div className="space-y-3">
            {topProducts.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No sales yet this week</p>
            ) : topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">{i + 1}</span>
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.sold} sold</div>
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrency(p.revenue)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <h3 className="mb-4 font-bold text-slate-900 dark:text-white">My Recent Sales</h3>
        <div className="space-y-3">
          {recentTransactions.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-400">No sales yet</p>
          ) : recentTransactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-white">{t.id}</div>
                <div className="text-xs text-slate-500">{t.time} · {t.items} items · {t.method}</div>
              </div>
              <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(t.amount)}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
