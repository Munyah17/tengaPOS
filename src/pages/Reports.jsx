import { motion } from 'framer-motion'
import {
  BarChart3, TrendingUp, DollarSign, Package, Users,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import ExportMenu from '@/components/common/ExportMenu'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'

const DEMO_MONTHLY = [
  { month: 'Jan', revenue: 12400, orders: 240, profit: 4200 },
  { month: 'Feb', revenue: 15200, orders: 310, profit: 5100 },
  { month: 'Mar', revenue: 13800, orders: 280, profit: 4600 },
  { month: 'Apr', revenue: 18600, orders: 380, profit: 6200 },
  { month: 'May', revenue: 21200, orders: 420, profit: 7100 },
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
  { header: 'Profit', key: 'profit' },
]

const EMPTY_STATE_CARDS = [
  { label: 'Total Revenue (MTD)', value: '$0.00', icon: DollarSign, change: null },
  { label: 'Total Orders (MTD)', value: '0', icon: BarChart3, change: null },
  { label: 'Avg Order Value', value: '$0.00', icon: TrendingUp, change: null },
  { label: 'Products Sold', value: '0', icon: Package, change: null },
]

export default function Reports() {
  const { posMode } = useThemeStore()
  const { isDemo } = useAuthStore()
  const accent = posMode === 'restaurant' ? '#22c55e' : '#3b82f6'
  const monthlyData = isDemo ? DEMO_MONTHLY : []
  const branchData = isDemo ? DEMO_BRANCH : []

  const summaryCards = isDemo
    ? [
        { label: 'Total Revenue (MTD)', value: '$21,200', icon: DollarSign, change: '+14%' },
        { label: 'Total Orders (MTD)', value: '420', icon: BarChart3, change: '+10.5%' },
        { label: 'Avg Order Value', value: '$50.48', icon: TrendingUp, change: '+3.2%' },
        { label: 'Products Sold', value: '2,847', icon: Package, change: '+8%' },
      ]
    : EMPTY_STATE_CARDS

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Reports</h1>
          <p className="text-sm text-slate-500">Business analytics and insights</p>
        </div>
        <ExportMenu data={monthlyData} columns={exportColumns} title="Sales Report" filename="tengapos_report" />
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
                <div className="text-xl font-extrabold text-slate-900 dark:text-white">{card.value}</div>
                {card.change && <div className="text-xs font-medium text-green-600">{card.change}</div>}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {!isDemo ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-24 dark:border-slate-700">
          <BarChart3 className="mb-3 h-12 w-12 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500">No sales data yet</p>
          <p className="mt-1 text-xs text-slate-400">Start selling on the POS — charts will appear here automatically</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue Trend */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                <Line type="monotone" dataKey="revenue" stroke={accent} strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
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
            <h3 className="mb-4 font-bold text-slate-900 dark:text-white">Branch Performance</h3>
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
