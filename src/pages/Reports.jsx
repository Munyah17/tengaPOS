import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart3, TrendingUp, DollarSign, Package, RefreshCw, Calendar, Download, ChevronDown } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useThemeStore } from '@/stores/themeStore'
import { useAuthStore } from '@/stores/authStore'
import DateInput, { TimeField } from '@/components/common/DateInput'
import { fetchReportMetrics, fetchTransactionsInRange } from '@/lib/db'
import { withOfflineCache, seedFromOfflineCache } from '@/lib/offlineCache'
import { formatCurrency } from '@/utils/formatters'
import { DATE_PRESETS, getPresetRange, combineDateAndTime } from '@/utils/dateRanges'
import { exportToCSV, exportToExcel, exportToPDF } from '@/utils/exportUtils'
import toast from 'react-hot-toast'

const PRIMARY_DATE_PRESETS = ['today', 'this_week', 'this_month']

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

  const queryClient = useQueryClient()
  useEffect(() => {
    if (!tenant?.id) return
    seedFromOfflineCache(queryClient, ['reportMetrics', tenant.id])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id])

  // ─── Period selector for the summary cards / branch breakdown below ───
  const [reportPreset, setReportPreset] = useState('this_month')
  const [reportCustomStart, setReportCustomStart] = useState('')
  const [reportCustomEnd, setReportCustomEnd] = useState('')
  const [reportCustomStartTime, setReportCustomStartTime] = useState('')
  const [reportCustomEndTime, setReportCustomEndTime] = useState('')
  // Only the 3 most-used presets get their own pill on mobile -- the rest
  // (Yesterday, Last Week, Last 3 Months, This Year, Custom Range) were
  // wrapping across 3-4 rows of tiny buttons on a phone. Reported live as
  // visibly cluttered; folded behind one "More" dropdown instead.
  const [morePresetOpen, setMorePresetOpen] = useState(false)

  const reportRange = (() => {
    if (reportPreset === 'custom') {
      if (!reportCustomStart || !reportCustomEnd) return null
      const start = combineDateAndTime(reportCustomStart, reportCustomStartTime, '00:00', 0)
      const end = combineDateAndTime(reportCustomEnd, reportCustomEndTime, '23:59', 59.999)
      return { start, end }
    }
    return getPresetRange(reportPreset)
  })()

  const metricsQuery = useQuery({
    queryKey: ['reportMetrics', tenant?.id, reportRange?.start?.toISOString(), reportRange?.end?.toISOString()],
    queryFn: withOfflineCache(
      ['reportMetrics', tenant?.id, reportRange?.start?.toISOString(), reportRange?.end?.toISOString()],
      () => fetchReportMetrics(tenant.id, reportRange ? { startDate: reportRange.start.toISOString(), endDate: reportRange.end.toISOString() } : {}),
    ),
    enabled: !!tenant?.id && !!reportRange,
    staleTime: 60000,
  })
  const metrics = metricsQuery.data || null
  const loading = metricsQuery.isLoading

  // ─── Formatted export: date presets + custom range ───
  const [exportOpen, setExportOpen] = useState(false)
  const [exportPreset, setExportPreset] = useState('this_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [customStartTime, setCustomStartTime] = useState('')
  const [customEndTime, setCustomEndTime] = useState('')
  const [exporting, setExporting] = useState(false)

  // Opening/closing balance for a daily cash-up export -- optional, since
  // most exports (a month-end report, a custom range for accounting) have
  // no till float to speak of. "Carry forward" pre-fills today's opening
  // balance with the closing balance saved from the last export, so a
  // cashier doing daily cash-ups doesn't have to re-type it every day --
  // reported live as an explicit ask, not just totals-on-export.
  const closingBalanceKey = tenant?.id ? `tengapos_closing_balance_${tenant.id}` : null
  const [openingBalance, setOpeningBalance] = useState('')
  const [carryForward, setCarryForward] = useState(false)

  const handleCarryForwardToggle = (checked) => {
    setCarryForward(checked)
    if (checked && closingBalanceKey) {
      const saved = localStorage.getItem(closingBalanceKey)
      setOpeningBalance(saved || '')
    }
  }

  const resolveExportRange = () => {
    if (exportPreset === 'custom') {
      if (!customStart || !customEnd) throw new Error('Pick both a start and end date')
      const start = combineDateAndTime(customStart, customStartTime, '00:00', 0)
      const end = combineDateAndTime(customEnd, customEndTime, '23:59', 59.999)
      if (start > end) throw new Error('Start date/time must be before end date/time')
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

      const total = rows.reduce((s, r) => s + (r.amount || 0), 0)
      const opening = openingBalance !== '' ? parseFloat(openingBalance) : null
      const summaryRows = [{ label: 'Total', value: formatCurrency(total) }]
      if (opening !== null && Number.isFinite(opening)) {
        const closing = opening + total
        summaryRows.push({ label: 'Opening Balance', value: formatCurrency(opening) })
        summaryRows.push({ label: 'Closing Balance', value: formatCurrency(closing) })
        if (closingBalanceKey) localStorage.setItem(closingBalanceKey, String(closing))
      }

      if (format === 'csv') exportToCSV(rows, filename, undefined, summaryRows)
      else if (format === 'excel') exportToExcel(rows, filename, undefined, summaryRows)
      else exportToPDF(rows, TRANSACTION_COLUMNS, `Sales Report — ${label}`, filename, tenant?.whitelabel?.enabled ? tenant.whitelabel.primary_color : null, summaryRows)
      toast.success(`Exported ${rows.length} transaction${rows.length !== 1 ? 's' : ''}`)
      setExportOpen(false)
    } catch (err) {
      toast.error(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const monthlyData = metrics?.monthlyData ?? []
  const branchData  = metrics?.branchData  ?? []
  const hasData = metrics && metrics.mtdOrders > 0
  const periodLabel = DATE_PRESETS.find((p) => p.key === reportPreset)?.label || 'Selected Period'

  const summaryCards = [
    { label: `Total Revenue (${periodLabel})`, value: formatCurrency(metrics?.mtdRevenue ?? 0), icon: DollarSign },
    { label: `Total Orders (${periodLabel})`, value: String(metrics?.mtdOrders ?? 0), icon: BarChart3 },
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
            onClick={() => metricsQuery.refetch()}
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
                    <DateInput value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold text-slate-500">To</label>
                    <DateInput value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                  </div>
                  <TimeField label="Start time" value={customStartTime} onChange={(e) => setCustomStartTime(e.target.value)} />
                  <TimeField label="End time" value={customEndTime} onChange={(e) => setCustomEndTime(e.target.value)} />
                </div>
              )}

              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <label className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                  <span>Opening Balance (optional)</span>
                  <span className="flex items-center gap-1 font-normal normal-case">
                    <input
                      type="checkbox"
                      checked={carryForward}
                      onChange={(e) => handleCarryForwardToggle(e.target.checked)}
                      className="h-3 w-3"
                    />
                    Carry forward
                  </span>
                </label>
                <input
                  type="number"
                  value={openingBalance}
                  onChange={(e) => { setCarryForward(false); setOpeningBalance(e.target.value) }}
                  placeholder="e.g. 50.00"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                />
                <p className="mt-1 text-[10px] text-slate-400">Leave blank to skip — the export will still include a Total row.</p>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5">
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

      {/* Period selector — filters the summary cards and branch breakdown below */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {DATE_PRESETS.filter((p) => PRIMARY_DATE_PRESETS.includes(p.key)).map((p) => (
          <button
            key={p.key}
            onClick={() => setReportPreset(p.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              reportPreset === p.key
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="relative">
          <button
            onClick={() => setMorePresetOpen((o) => !o)}
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              !PRIMARY_DATE_PRESETS.includes(reportPreset)
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {!PRIMARY_DATE_PRESETS.includes(reportPreset)
              ? (DATE_PRESETS.find((p) => p.key === reportPreset)?.label || 'Custom')
              : 'Custom'}
            <ChevronDown className="h-3 w-3" />
          </button>
          <AnimatePresence>
            {morePresetOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute left-0 z-20 mt-2 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800"
              >
                {DATE_PRESETS.filter((p) => !PRIMARY_DATE_PRESETS.includes(p.key) && p.key !== 'custom').map((p) => (
                  <button
                    key={p.key}
                    onClick={() => { setReportPreset(p.key); setMorePresetOpen(false) }}
                    className="block w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => { setReportPreset('custom'); setMorePresetOpen(false) }}
                  className="block w-full border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Custom Range
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {reportPreset === 'custom' && (
          <>
            <DateInput value={reportCustomStart} onChange={(e) => setReportCustomStart(e.target.value)} placeholder="From" className="w-36" />
            <TimeField value={reportCustomStartTime} onChange={(e) => setReportCustomStartTime(e.target.value)} label="" />
            <span className="text-xs text-slate-400">—</span>
            <DateInput value={reportCustomEnd} onChange={(e) => setReportCustomEnd(e.target.value)} placeholder="To" className="w-36" />
            <TimeField value={reportCustomEndTime} onChange={(e) => setReportCustomEndTime(e.target.value)} label="" />
          </>
        )}
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
