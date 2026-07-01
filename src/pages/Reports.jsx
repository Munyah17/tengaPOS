import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, DollarSign, Package, RefreshCw } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import ExportMenu from '@/components/common/ExportMenu'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchReportMetrics } from '@/lib/db'
import { formatCurrency } from '@/utils/formatters'

const DEMO_MONTHLY = [
  { month: 'Jan', revenue: 12400, orders: 240 },
  { month: 'Feb', revenue: 15200, orders: 310 },
  { month: 'Mar', revenue: 13800, orders: 280 },
  { month: 'Apr', revenue: 18600, orders: 380 },
  { month: 'May', revenue: 21200, orders: 420 },
]

const DEMO_BRANCH = [
  { branch: 'Main', revenue: 45200, orders: 920 },
  { branch: 'CBD', revenue: 32100, orders: 650 },
  { branch: 'Mall', revenue: 28400, orders: 580 },
]

const exportColumns = [
  { header: 'Month', key: 'month' },
  { header: 'Revenue', key: 'revenue' },
  { header: 'Orders', key: 'orders' },
]

export default function Reports() {
  const { posMode } = useThemeStore()
  const { isDemo, tenant } = useAuthStore()
  const accent = posMode === 'restaurant' ? '#22c55e' : '#3b82f6'

  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    if (isDemo || !tenant?.id) return
    setLoading(true)
    fetchReportMetrics(tenant.id)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [isDemo, tenant?.id])

  const monthlyData = isDemo ? DEMO_MONTHLY : (metrics?.monthlyData ?? [])
  const branchData  = isDemo ? DEMO_BRANCH  : (metrics?.branchData  ?? [])
  const hasData = isDemo || (metrics && metrics.mtdOrders > 0)

  const summaryCards = isDemo
    ? [
        { label: 'Total Revenue (MTD)', value: '$21,200', icon: DollarSign },
        { label: 'Total Orders (MTD)', value: '420', icon: BarChart3 },
        { label: 'Avg Order Value', value: '$50.48', icon: TrendingUp },
        { label: 'Products Sold', value: '2,847', icon: Package },
      ]
    : [
        { label: 'Total Revenue (MTD)', value: formatCurrency(metrics?.mtdRevenue ?? 0), icon: DollarSign },
        { label: 'Total Orders (MTD)', value: String(metrics?.mtdOrders ?? 0), icon: BarChart3 },
        { label: 'Avg Order Value', value: formatCurrency(metrics?.avgOrderValue ?? 0), icon: TrendingUp },
        { label: 'Products Sold', value: String(metrics?.productsSold ?? 0), icon: Package },
      ]

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Reports</h1>
          <p className="text-sm text-slate-500">Business analytics and insights</p>
        </div>
        <div className="flex gap-2">
          {!isDemo && (
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <ExportMenu data={monthlyData} columns={exportColumns} title="Sales Report" filename="tengapos_report" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-brand-100 p-2 text-brand-600 dark:bg-brand-900 dark:text-brand-400">
                <card.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-slate-500">{card.label}</div>
                <div className={`text-xl font-extrabold text-slate-900 dark:text-white ${loading ? 'animate-pulse' : ''}`}>
                  {card.value}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      {!hasData ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-24 dark:border-slate-700">
          <BarChart3 className="mb-3 h-12 w-12 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500">No sales data yet</p>
          <p className="mt-1 text-xs text-slate-400">Start selling on the POS — charts will populate automatically</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue Trend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Revenue Trend (6 months)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                <Line type="monotone" dataKey="revenue" stroke={accent} strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Branch Performance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Branch Performance (MTD)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={branchData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="branch" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                <Bar dataKey="revenue" fill={accent} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      )}
    </div>
  )
}
