import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  DollarSign, ShoppingCart, Package, Users, TrendingUp,
  AlertTriangle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { Link } from 'react-router-dom'
import { Megaphone, Sparkles, Bell, ChevronRight } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchDashboardMetrics } from '@/lib/db'
import { formatCurrency } from '@/utils/formatters'
import { supabase } from '@/lib/supabase'
import { useTenantNotifications } from '@/hooks/useTenantNotifications'
import OnboardingChecklist from '@/components/common/OnboardingChecklist'

const EMPTY_STAT_CARDS = [
  { label: "Today's Revenue", value: '$0.00', change: null, up: null, icon: DollarSign, color: 'brand' },
  { label: "Today's Orders", value: '0', change: null, up: null, icon: ShoppingCart, color: 'green' },
  { label: 'Total Products', value: '0', change: null, up: null, icon: Package, color: 'purple' },
  { label: 'Active Staff', value: '0', change: null, up: null, icon: Users, color: 'orange' },
]

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']

const colorMap = {
  brand: 'from-brand-500 to-brand-700',
  green: 'from-green-500 to-green-700',
  purple: 'from-purple-500 to-purple-700',
  orange: 'from-orange-500 to-orange-700',
}

export default function Dashboard() {
  const { posMode } = useThemeStore()
  const { profile, tenant } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const accentColor = isRestaurant ? '#22c55e' : '#3b82f6'
  const { notifications } = useTenantNotifications({ tenantId: tenant?.id, posMode, limit: 5 })

  // Cached instead of a hard fetch on every mount — revisiting the
  // dashboard within a minute reuses what's already loaded.
  const { data: metrics = null } = useQuery({
    queryKey: ['dashboardMetrics', tenant?.id],
    queryFn: () => fetchDashboardMetrics(tenant.id),
    enabled: !!tenant?.id,
    staleTime: 60000,
  })

  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const { data } = await supabase
        .from('announcements')
        .select('id, title, body, created_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(3)
      return data || []
    },
    staleTime: 5 * 60000,
  })

  // 7-day free trial countdown
  const onTrial = tenant?.trial_ends_at && !tenant?.plan_start_date
  const trialDaysLeft = onTrial
    ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at) - Date.now()) / 86400000))
    : null

  const statCards = metrics ? [
    { label: "Today's Revenue", value: formatCurrency(metrics.todayRevenue), change: null, up: null, icon: DollarSign, color: 'brand' },
    { label: "Today's Orders", value: String(metrics.todayOrders), change: null, up: null, icon: ShoppingCart, color: 'green' },
    { label: 'Total Products', value: String(metrics.totalProducts), change: null, up: null, icon: Package, color: 'purple' },
    { label: 'Active Staff', value: String(metrics.activeStaff), change: null, up: null, icon: Users, color: 'orange' },
  ] : EMPTY_STAT_CARDS

  const revenueData = metrics?.weekData || []
  const categoryData = metrics?.categoryData || []
  const topProducts = metrics?.topProducts || []
  const recentTransactions = metrics?.recentTransactions?.map(t => ({
    id: t.reference || t.id,
    time: new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    amount: parseFloat(t.amount),
    items: t.orders?.order_items?.reduce((s, i) => s + i.qty, 0) || 0,
    method: t.method,
  })) || []
  const lowStockItems = metrics?.lowStockItems?.map(p => ({ name: p.name, stock: p.stock_qty, threshold: p.low_stock_threshold || 10 })) || []

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Welcome to tengaPOS, {profile?.name || 'there'} — your portal is ready
        </p>
      </div>

      <OnboardingChecklist totalProducts={metrics?.totalProducts} />

      {/* 7-day trial countdown */}
      {onTrial && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-green-300 bg-green-50 p-4 dark:border-green-700/60 dark:bg-green-900/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-semibold text-green-900 dark:text-green-200">
                Free trial — {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left
              </p>
              <p className="text-sm text-green-800 dark:text-green-300">
                You have full access to everything. Choose a plan any time to keep going after the trial.
              </p>
            </div>
          </div>
          <Link
            to="/checkout"
            className="flex-shrink-0 self-start rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 sm:self-auto"
          >
            Choose a Plan
          </Link>
        </div>
      )}

      {/* Platform announcements */}
      {announcements.length > 0 && (
        <div className="mb-6 space-y-2">
          {announcements.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800/50 dark:bg-indigo-900/20">
              <Megaphone className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
              <div>
                <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">{a.title}</p>
                <p className="text-sm text-indigo-800 dark:text-indigo-300">{a.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stat Cards */}
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
              <div className={`rounded-xl bg-gradient-to-br ${colorMap[card.color]} p-2 text-white`}>
                <card.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">{card.value}</div>
            {card.up !== null && (
              <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                card.up ? 'text-green-600' : 'text-red-600'
              }`}>
                {card.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {card.change} from yesterday
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Recent Notifications */}
      {notifications.length > 0 && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-brand-500" />
              <h3 className="font-bold text-slate-900 dark:text-white">Recent Notifications</h3>
            </div>
            <Link to="/app/notifications" className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
              See all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {notifications.slice(0, 4).map((n) => (
              <div key={n.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <n.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 dark:text-slate-200">{n.text}</p>
                  <p className="text-xs text-slate-400">{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2"
        >
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Revenue This Week</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
              <Area type="monotone" dataKey="revenue" stroke={accentColor} strokeWidth={2} fill="url(#revenueGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Category Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Sales by Category</h3>
          {categoryData.length === 0 ? (
            <p className="py-16 text-center text-xs text-slate-400">No products yet</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {categoryData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {categoryData.map((cat, i) => (
                  <div key={cat.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                      <span className="text-slate-600 dark:text-slate-400">{cat.name}</span>
                    </div>
                    <span className="font-medium text-slate-900 dark:text-white">{cat.value}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Top Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <h3 className="font-bold text-slate-900 dark:text-white">Top Selling</h3>
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
                <span className="text-sm font-semibold text-slate-900 dark:text-white">${p.revenue.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Transactions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Recent Transactions</h3>
          <div className="space-y-3">
            {recentTransactions.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No transactions yet</p>
            ) : recentTransactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{t.id}</div>
                  <div className="text-xs text-slate-500">{t.time} · {t.items} items · {t.method}</div>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">${t.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Low Stock Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="font-bold text-slate-900 dark:text-white">Low Stock Alerts</h3>
          </div>
          <div className="space-y-3">
            {lowStockItems.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">Stock levels look healthy</p>
            ) : lowStockItems.map((item) => (
              <div key={item.name} className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900 dark:text-amber-200">{item.stock} left</span>
                </div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-amber-200 dark:bg-amber-800">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${(item.stock / item.threshold) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Orders Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
      >
        <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Daily Orders</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={revenueData}>
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
            <Bar dataKey="orders" fill={accentColor} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </div>
  )
}
