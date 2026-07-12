import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, DollarSign, Package, RefreshCw, Calendar, Download } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import { fetchReportMetrics, fetchTransactionsInRange } from '@/lib/db'
import { formatCurrency } from '@/utils/formatters'
import { DATE_PRESETS, getPresetRange } from '@/utils/dateRanges'
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/exportUtils'
import toast from 'react-hot-toast'

const TRANSACTION_COLUMNS = [
  { header: 'Reference', key: 'reference' },
  { header: 'Date', key: 'date' },
  { header: 'Time', key: 'time' },
  { header: 'Branch', key: 'branch' },
  { header: 'Method', key: 'method' },
  { header: 'Status', key: 'status' },
  { header: 'Items', key: 'items' },
  { header: 'Amount', key: 'amount' },
]

export default function Reports() {
  const { posMode } = useThemeStore()
  const { tenant } = useAuthStore()
  const accent = posMode === 'restaurant' ? '#22c55e' : '#3b82f6'

  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(false)

  // ─── Formatted export: date presets + custom range ───
  const [exportOpen, setExportOpen] = useState(false)
  const [exportPreset, setExportPreset] = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [exporting, setExporting] = useState(false)

  const resolveExportRange = () => {
    if (exportPreset === 'custom') {
      if (!customStart || !customEnd) throw new Error('Pick both a start and end date')
      const start = new Date(customStart)
      const end = new Date(customEnd)
      end.setHours(23, 59, 59, 999)
      if (start > end) throw new Error('Start date must be before end date')
      return { start, end }
    }
    return getPresetRange(exportPreset)
  }

  const runExport = async (format) => {
    setExporting(true)
    try {
      const { start, end } = resolveExportRange()
      const rows = await fetchTransactionsInRange(tenant.id, start.toISOString(), end.toISOString())
      if (rows.length === 0) {
        toast.error('No transactions in that range')
        return
      }
      const label = DATE_PRESETS.find((p) => p.key === exportPreset)?.label || 'custom'
      const filename = `tengapos_report_${label.toLowerCase().replace(/\s+/g, '_')}`
      if (format === 'csv') exportToCSV(rows, filename)
      else if (format === 'excel') exportToExcel(rows, filename)
      else exportToPDF(rows, TRANSACTION_COLUMNS, `Sales Report — ${label}`, filename)
      toast.success(`Exported ${rows.length} transaction${rows.length !== 1 ? 's' : ''}`)
      setExportOpen(false)
    } catch (err) {
      toast.error(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const load = () => {
    if (!tenant?.id) return
    setLoading(true)
    fetchReportMetrics(tenant.id)
      .then(setMetrics)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [tenant?.id])

  const monthlyData = metrics?.monthlyData ?? []
  const branchData  = metrics?.branchData  ?? []
  const hasData = metrics && metrics.mtdOrders > 0

  const summaryCards = [
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
        <div className="relative flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setExportOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <Calendar className="h-4 w-4" />
            Export Report
          </button>

          {exportOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Date Range</p>
              <div className="grid grid-cols-2 gap-1.5">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setExportPreset(p.key)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      exportPreset === p.key
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {exportPreset === 'custom' && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-500">From</label>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-500">To</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => runExport('csv')}
                  disabled={exporting}
                  className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300"
                >
                  <Download className="h-3 w-3" /> CSV
                </button>
                <button
                  onClick={() => runExport('excel')}
                  disabled={exporting}
                  className="flex items-center justify-center gap-1 rounded-lg bg-slate-100 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300"
                >
                  <Download className="h-3 w-3" /> Excel
                </button>
                <button
                  onClick={() => runExport('pdf')}
                  disabled={exporting}
                  className="flex items-center justify-center gap-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  <Download className="h-3 w-3" /> PDF
                </button>
              </div>
              {exporting && <p className="mt-2 text-center text-xs text-slate-400">Preparing export…</p>}
            </div>
          )}
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
