import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  DollarSign, ShoppingCart, Package, Users, TrendingUp,
  TrendingDown, AlertTriangle, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { Link } from 'react-router-dom'
import { Megaphone, Sparkles } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchDashboardMetrics } from '@/lib/db'
import { formatCurrency } from '@/utils/formatters'
import { supabase } from '@/lib/supabase'

const DEMO_REVENUE = [
  { name: 'Mon', revenue: 2400, orders: 24 },
  { name: 'Tue', revenue: 3200, orders: 31 },
  { name: 'Wed', revenue: 2800, orders: 28 },
  { name: 'Thu', revenue: 3800, orders: 38 },
  { name: 'Fri', revenue: 4200, orders: 42 },
  { name: 'Sat', revenue: 5100, orders: 51 },
  { name: 'Sun', revenue: 3600, orders: 36 },
]

const DEMO_TOP_PRODUCTS = [
  { name: 'Coca-Cola 500ml', sold: 145, revenue: 217.50 },
  { name: 'Bread - White Loaf', sold: 120, revenue: 144.00 },
  { name: 'Fresh Milk 1L', sold: 98, revenue: 245.00 },
  { name: 'Chicken Portions 1kg', sold: 65, revenue: 389.35 },
  { name: 'Lays Chips 125g', sold: 203, revenue: 365.40 },
]

const DEMO_CATEGORIES = [
  { name: 'Beverages', value: 35 },
  { name: 'Bakery', value: 20 },
  { name: 'Dairy', value: 15 },
  { name: 'Meat', value: 12 },
  { name: 'Produce', value: 10 },
  { name: 'Other', value: 8 },
]

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']

const DEMO_RECENT_TX = [
  { id: 'TP-240524-0001', time: '2 min ago', amount: 15.50, items: 3, method: 'Cash' },
  { id: 'TP-240524-0002', time: '8 min ago', amount: 42.75, items: 7, method: 'EcoCash' },
  { id: 'TP-240524-0003', time: '15 min ago', amount: 8.20, items: 2, method: 'Cash' },
  { id: 'TP-240524-0004', time: '22 min ago', amount: 67.90, items: 12, method: 'Visa' },
  { id: 'TP-240524-0005', time: '34 min ago', amount: 23.00, items: 4, method: 'InnBucks' },
]

const DEMO_LOW_STOCK = [
  { name: 'Beef Mince 500g', stock: 15, threshold: 20 },
  { name: 'Chicken Portions 1kg', stock: 28, threshold: 30 },
  { name: 'Brown Bread Loaf', stock: 36, threshold: 40 },
]

const DEMO_STAT_CARDS = [
  { label: "Today's Revenue", value: '$5,124.50', change: '+12.5%', up: true, icon: DollarSign, color: 'brand' },
  { label: "Today's Orders", value: '284', change: '+8.2%', up: true, icon: ShoppingCart, color: 'green' },
  { label: 'Total Products', value: '1,432', change: '+3', up: true, icon: Package, color: 'purple' },
  { label: 'Active Staff', value: '12', change: '0', up: null, icon: Users, color: 'orange' },
]

const EMPTY_STAT_CARDS = [
  { label: "Today's Revenue", value: '$0.00', change: null, up: null, icon: DollarSign, color: 'brand' },
  { label: "Today's Orders", value: '0', change: null, up: null, icon: ShoppingCart, color: 'green' },
  { label: 'Total Products', value: '0', change: null, up: null, icon: Package, color: 'purple' },
  { label: 'Active Staff', value: '0', change: null, up: null, icon: Users, color: 'orange' },
]

const colorMap = {
  brand: 'from-brand-500 to-brand-700',
  green: 'from-green-500 to-green-700',
  purple: 'from-purple-500 to-purple-700',
  orange: 'from-orange-500 to-orange-700',
}

export default function Dashboard() {
  const { posMode } = useThemeStore()
  const { isDemo, profile, tenant } = useAuthStore()
  const isRestaurant = posMode === 'restaurant'
  const accentColor = isRestaurant ? '#22c55e' : '#3b82f6'
  const [metrics, setMetrics] = useState(null)
  const [announcements, setAnnouncements] = useState([])

  useEffect(() => {
    if (isDemo || !tenant?.id) return
    fetchDashboardMetrics(tenant.id).then(setMetrics).catch(() => {})
    supabase
      .from('announcements')
      .select('id, title, body, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => setAnnouncements(data || []))
  }, [isDemo, tenant?.id])

  // 7-day free trial countdown
  const onTrial = !isDemo && tenant?.trial_ends_at && !tenant?.plan_start_date
  const trialDaysLeft = onTrial
    ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at) - Date.now()) / 86400000))
    : null

  const liveCards = metrics ? [
    { label: "Today's Revenue", value: formatCurrency(metrics.todayRevenue), change: null, up: null, icon: DollarSign, color: 'brand' },
    { label: "Today's Orders", value: String(metrics.todayOrders), change: null, up: null, icon: ShoppingCart, color: 'green' },
    { label: 'Total Products', value: String(metrics.totalProducts), change: null, up: null, icon: Package, color: 'purple' },
    { label: 'Active Staff', value: String(metrics.activeStaff), change: null, up: null, icon: Users, color: 'orange' },
  ] : EMPTY_STAT_CARDS

  const statCards = isDemo ? DEMO_STAT_CARDS : liveCards
  const revenueData = isDemo ? DEMO_REVENUE : (metrics?.weekData || [])
  const categoryData = isDemo ? DEMO_CATEGORIES : []
  const topProducts = isDemo ? DEMO_TOP_PRODUCTS : []
  const recentTransactions = isDemo ? DEMO_RECENT_TX : (metrics?.recentTransactions?.map(t => ({
    id: t.reference || t.id,
    time: new Date(t.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    amount: parseFloat(t.amount),
    items: t.orders?.order_items?.reduce((s, i) => s + i.qty, 0) || 0,
    method: t.method,
  })) || [])
  const lowStockItems = isDemo ? DEMO_LOW_STOCK : (metrics?.lowStockItems?.map(p => ({ name: p.name, stock: p.stock_qty, threshold: p.low_stock_threshold || 10 })) || [])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isDemo ? 'Welcome back — here’s your business overview' : `Welcome to tengaPOS, ${profile?.name || 'there'} — your portal is ready`}
        </p>
      </div>

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

      {isDemo ? (
        <>
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
                {topProducts.map((p, i) => (
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
                {recentTransactions.map((t) => (
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
                {lowStockItems.map((item) => (
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
              <div className="mt-6">
                <h4 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Staff Activity</h4>
                <div className="space-y-2">
                  {[
                    { name: 'Tatenda M.', action: 'Completed sale #0042', time: '5m ago' },
                    { name: 'Grace K.', action: 'Added 50 items to stock', time: '12m ago' },
                    { name: 'Farai N.', action: 'Voided transaction #0038', time: '28m ago' },
                  ].map((a) => (
                    <div key={a.name} className="flex items-start gap-2 text-xs">
                      <div className="mt-0.5 h-5 w-5 rounded-full bg-brand-100 text-center leading-5 text-brand-700 dark:bg-brand-900 dark:text-brand-300">{a.name[0]}</div>
                      <div>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{a.name}</span>
                        <span className="text-slate-500"> {a.action}</span>
                        <div className="text-slate-400">{a.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
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
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-24 dark:border-slate-700"
        >
          <ShoppingCart className="mb-4 h-14 w-14 text-slate-300 dark:text-slate-700" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">Your store is ready</h3>
          <p className="mt-2 max-w-xs text-center text-sm text-slate-400">
            Add products to your inventory, then make your first sale on the POS. Charts and insights will appear here automatically.
          </p>
        </motion.div>
      )}
    </div>
  )
}
