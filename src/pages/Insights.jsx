import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Sparkles, TrendingUp, Package, DollarSign, AlertCircle,
  RefreshCw, MapPin,
  FileText, Table, Printer, Lightbulb, Target, ShoppingCart,
  Star, ArrowUp, ArrowDown, Minus,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { supabase } from '@/lib/supabase'
import { fetchProductPerformance } from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import { getPresetRange } from '@/utils/dateRanges'
import { hexToRgb } from '@/utils/exportUtils'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import Papa from 'papaparse'

// Date-range presets — real accounts query actual sales for the matching
// window (see dateRanges.js). No trend deltas until a prior-period baseline
// is tracked, so trends are simply omitted rather than fabricated.
const TIMELINES = [
  { key: 'today',      label: 'Today' },
  { key: 'this_week',  label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: '3months',    label: 'Last 3 Months' },
  { key: 'year',       label: 'This Year' },
]

function Metric({ label, value, sub, color = 'brand', icon: Icon, trend }) {
  const colors = {
    brand: 'bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400',
    green: 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
    purple: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className={`mb-3 inline-flex rounded-xl p-2.5 ${colors[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{value}</div>
      <div className="mt-0.5 text-sm text-slate-500">{label}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
      {trend !== undefined && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-semibold ${trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-slate-400'}`}>
          {trend > 0 ? <ArrowUp className="h-3 w-3" /> : trend < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {trend > 0 ? '+' : ''}{trend}% vs last period
        </div>
      )}
    </div>
  )
}

async function callGroqEdge(prompt) {
  const { data, error } = await supabase.functions.invoke('groq-insights', {
    body: { prompt },
  })
  if (error) throw new Error(error.message || 'Edge function error')
  if (data?.error) throw new Error(data.error)
  return data
}

function buildPrompt(products, timeline, location, posMode) {
  const top = [...products].sort((a, b) => b.sold - a.sold).slice(0, 8)
  const slow = [...products].sort((a, b) => a.sold - b.sold).slice(0, 4)
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  const totalProfit = products.reduce((s, p) => s + (p.revenue - p.cost), 0)
  const type = posMode === 'restaurant' ? 'restaurant/food service' : 'retail shop'

  return `
You are advising a ${type} business in ${location || 'Zimbabwe'} for the period: ${timeline}.

BUSINESS SUMMARY:
- Total revenue: $${totalRevenue.toFixed(2)}
- Total gross profit: $${totalProfit.toFixed(2)} (${((totalProfit / totalRevenue) * 100).toFixed(1)}% margin)
- Total products/dishes: ${products.length}

TOP SELLERS (by units):
${top.map(p => `- ${p.name} (${p.category}): ${p.sold} units, $${p.revenue.toFixed(2)} revenue, margin ${(((p.revenue - p.cost) / p.revenue) * 100).toFixed(0)}%`).join('\n')}

SLOW MOVERS (lowest sales):
${slow.map(p => `- ${p.name} (${p.category}): ${p.sold} units, $${p.revenue.toFixed(2)} revenue`).join('\n')}

Respond ONLY with this exact JSON structure:
{
  "headline": "one-sentence business health summary",
  "topInsights": [
    { "title": "...", "body": "...", "type": "positive|warning|neutral" }
  ],
  "stockAdvice": [
    { "product": "...", "action": "increase|maintain|reduce|discontinue", "reason": "...", "suggestedQty": "e.g. keep 50+ units at all times" }
  ],
  "pricingAdvice": [
    { "product": "...", "currentMargin": "XX%", "suggestedPrice": "$X.XX", "reason": "market context, competition, local economic factors in ${location || 'Zimbabwe'}" }
  ],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
  "risks": ["risk 1", "risk 2"],
  "actionItems": ["quick win 1", "quick win 2", "quick win 3", "quick win 4"]
}
`.trim()
}

function InsightCard({ insight, i }) {
  const colors = {
    positive: 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30',
    warning: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
    neutral: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
  }
  const icons = {
    positive: <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />,
    warning: <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
    neutral: <Lightbulb className="h-4 w-4 text-brand-600 dark:text-brand-400" />,
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.07 }}
      className={`rounded-2xl border p-4 ${colors[insight.type] || colors.neutral}`}
    >
      <div className="mb-2 flex items-center gap-2">
        {icons[insight.type] || icons.neutral}
        <span className="text-sm font-bold text-slate-900 dark:text-white">{insight.title}</span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">{insight.body}</p>
    </motion.div>
  )
}

export default function Insights() {
  const { profile, tenant } = useAuthStore()
  const { posMode } = useThemeStore()

  const [timeline, setTimeline] = useState('this_month')
  const [location, setLocation] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [products, setProducts] = useState([])
  const [dataLoading, setDataLoading] = useState(false)
  const reportRef = useRef(null)

  const tlMeta = TIMELINES.find((t) => t.key === timeline) || TIMELINES[2]

  // Fetch actual sales for the date range — starts at zero for a brand-new
  // business and grows only from real transactions.
  useEffect(() => {
    if (!tenant?.id) return
    const { start } = getPresetRange(timeline)
    const load = () => loadWithOfflineCache(
      ['productPerformance', tenant.id, timeline],
      () => fetchProductPerformance(tenant.id, start.toISOString()),
      { onData: setProducts, onError: () => toast.error('Failed to load sales data'), onLoadingChange: setDataLoading },
    )
    load()
    window.addEventListener('tengapos:force-refresh', load)
    return () => window.removeEventListener('tengapos:force-refresh', load)
  }, [tenant?.id, timeline])

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  const totalProfit  = products.reduce((s, p) => s + (p.revenue - p.cost), 0)
  const totalUnits   = products.reduce((s, p) => s + p.sold, 0)

  const generateInsights = async () => {
    if (products.length === 0) { toast.error('No sales in this period yet — insights need transaction history'); return }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const prompt = buildPrompt(products, tlMeta.label, location, posMode)
      const data = await callGroqEdge(prompt)
      setResult(data)
      toast.success('AI analysis complete!')
    } catch (e) {
      setError(e.message)
      toast.error(`AI error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const exportCSV = () => {
    const rows = products.map(p => ({
      'Product': p.name,
      'Category': p.category,
      'Units Sold': p.sold,
      'Revenue ($)': p.revenue.toFixed(2),
      'Cost ($)': p.cost.toFixed(2),
      'Gross Profit ($)': (p.revenue - p.cost).toFixed(2),
      'Margin (%)': (((p.revenue - p.cost) / p.revenue) * 100).toFixed(1),
    }))
    const csv = Papa.unparse(rows)
    saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `insights_${timeline}.csv`)
    toast.success('CSV downloaded')
  }

  const exportExcel = () => {
    const rows = products.map(p => ({
      Product: p.name,
      Category: p.category,
      'Units Sold': p.sold,
      'Revenue ($)': p.revenue,
      'Cost ($)': p.cost,
      'Gross Profit ($)': +(p.revenue - p.cost).toFixed(2),
      'Margin (%)': +((p.revenue - p.cost) / p.revenue * 100).toFixed(1),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Data')
    XLSX.writeFile(wb, `insights_${timeline}.xlsx`)
    toast.success('Excel downloaded')
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(`${tenant?.name || 'Business'} — Sales Insights (${TIMELINES.find(t => t.key === timeline)?.label})`, 14, 20)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')} | Location: ${location || 'Zimbabwe'}`, 14, 28)
    autoTable(doc, {
      startY: 35,
      head: [['Product', 'Category', 'Units', 'Revenue', 'Cost', 'Profit', 'Margin']],
      body: products.map(p => [
        p.name, p.category, p.sold, `$${p.revenue.toFixed(2)}`,
        `$${p.cost.toFixed(2)}`, `$${(p.revenue - p.cost).toFixed(2)}`,
        `${((p.revenue - p.cost) / p.revenue * 100).toFixed(1)}%`,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: hexToRgb(tenant?.whitelabel?.enabled ? tenant.whitelabel.primary_color : null, [37, 99, 235]) },
    })
    if (result) {
      let y = doc.lastAutoTable.finalY + 10
      doc.setFontSize(13)
      doc.text('AI Recommendations', 14, y)
      y += 6
      doc.setFontSize(9)
      result.actionItems?.forEach((item) => {
        doc.text(`• ${item}`, 14, y)
        y += 5
      })
    }
    doc.save(`insights_${timeline}.pdf`)
    toast.success('PDF downloaded')
  }

  const aiUnlocked = tenant?.features?.ai_insights === true
  if (!aiUnlocked) {
    return (
      <div className="p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">AI Insights</h1>
          <p className="text-sm text-slate-500">AI-powered sales, pricing, and stock recommendations</p>
        </div>
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 dark:border-amber-700/50 dark:bg-amber-900/20">
          <h4 className="font-bold text-amber-900 dark:text-amber-200">AI Insights isn't active yet</h4>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            This is a paid add-on ($1/month). Request it from Settings and it'll unlock here once approved.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">AI Insights</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">AI-Powered Data Analysis</p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeline */}
          <select
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {TIMELINES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>

          {/* Export */}
          <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <button onClick={exportCSV} className="flex items-center gap-1.5 border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <Table className="h-3.5 w-3.5" />CSV
            </button>
            <button onClick={exportExcel} className="flex items-center gap-1.5 border-r border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <FileText className="h-3.5 w-3.5" />Excel
            </button>
            <button onClick={exportPDF} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
              <Printer className="h-3.5 w-3.5" />PDF
            </button>
          </div>

          <button
            onClick={generateInsights}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Analysing…' : 'Generate Insights'}
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total Revenue" value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={DollarSign} color="brand" sub={tlMeta.label} />
        <Metric label="Gross Profit"  value={`$${totalProfit.toLocaleString(undefined,  { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp}  color="green"  sub={`${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}% margin`} />
        <Metric label="Units Sold"    value={totalUnits.toLocaleString()}            icon={ShoppingCart} color="purple" />
        <Metric label="Products Sold" value={products.length}                        icon={Package}      color="amber"  sub="In this period" />
      </div>

      {/* Location input */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <MapPin className="h-4 w-4 flex-shrink-0 text-slate-400" />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (e.g. Harare CBD, Bulawayo)"
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 focus:outline-none dark:text-white"
          />
        </div>
      </div>

      {/* AI results — always above the product table, full width */}
      <div className="mb-6">
        {!result && !loading && !error && (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
            <Sparkles className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
            <p className="font-semibold text-slate-500">AI analysis ready</p>
            <p className="mt-1 text-xs text-slate-400">Set your timeline and location, then click Generate Insights</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
            <RefreshCw className="mb-3 h-8 w-8 animate-spin text-brand-500" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Analysing your business data…</p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-bold">Analysis failed</span>
            </div>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Headline */}
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
              <div className="flex items-center gap-2 text-brand-700 dark:text-brand-400">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-bold">AI Summary</span>
              </div>
              <p className="mt-1 text-sm text-brand-800 dark:text-brand-300">{result.headline}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Key insights */}
              {result.topInsights?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Key Insights</h3>
                  {result.topInsights.map((ins, i) => <InsightCard key={i} insight={ins} i={i} />)}
                </div>
              )}

              {/* Stock advice */}
              {result.stockAdvice?.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Stock Recommendations</h3>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    {result.stockAdvice.map((s, i) => {
                      const ac = { increase: 'text-green-600 bg-green-50 dark:bg-green-900/30', maintain: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30', reduce: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30', discontinue: 'text-red-600 bg-red-50 dark:bg-red-900/30' }
                      return (
                        <div key={i} className={`flex flex-wrap items-start gap-3 border-b border-slate-100 p-3 last:border-0 dark:border-slate-800`}>
                          <span className={`rounded-lg px-2 py-0.5 text-xs font-bold capitalize ${ac[s.action] || ac.maintain}`}>{s.action}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">{s.product}</p>
                            <p className="text-xs text-slate-500">{s.reason}</p>
                            {s.suggestedQty && <p className="mt-0.5 text-xs font-medium text-brand-600 dark:text-brand-400">{s.suggestedQty}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Pricing advice */}
              {result.pricingAdvice?.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Pricing Intelligence</h3>
                  <div className="space-y-2">
                    {result.pricingAdvice.map((p, i) => (
                      <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-800 dark:text-white">{p.product}</span>
                          <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-sm font-bold text-brand-600 dark:bg-brand-900/40 dark:text-brand-400">{p.suggestedPrice}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{p.reason}</p>
                        {p.currentMargin && <p className="mt-0.5 text-xs text-slate-400">Current margin: {p.currentMargin}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action items */}
              {result.actionItems?.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Action Items</h3>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <ul className="space-y-2">
                      {result.actionItems.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <Target className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Opportunities & Risks */}
              {(result.opportunities?.length > 0 || result.risks?.length > 0) && (
                <div className="grid grid-cols-2 gap-3">
                  {result.opportunities?.length > 0 && (
                    <div className="rounded-2xl border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">Opportunities</h3>
                      <ul className="space-y-1">
                        {result.opportunities.map((o, i) => <li key={i} className="text-xs text-green-800 dark:text-green-300">• {o}</li>)}
                      </ul>
                    </div>
                  )}
                  {result.risks?.length > 0 && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-red-700 dark:text-red-400">Watch Out</h3>
                      <ul className="space-y-1">
                        {result.risks.map((r, i) => <li key={i} className="text-xs text-red-700 dark:text-red-300">• {r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Product performance table — always below the AI analysis */}
      <div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Product Performance</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase text-slate-500">Product</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-slate-500">Units</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-slate-500">Revenue</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-slate-500">Profit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-slate-500">Margin</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-slate-500">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {dataLoading ? (
                    <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                      <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading sales data…
                    </td></tr>
                  ) : products.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                      No sales in this period yet — insights fill in as you sell.
                    </td></tr>
                  ) : [...products].sort((a, b) => b.revenue - a.revenue).map((p, i) => {
                    const profit = p.revenue - p.cost
                    const margin = (profit / p.revenue) * 100
                    return (
                      <tr key={p.name} className="border-b border-slate-50 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</div>
                          <div className="text-xs text-slate-400">{p.category}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-medium text-slate-700 dark:text-slate-300">{p.sold}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-medium text-slate-900 dark:text-white">${p.revenue.toFixed(2)}</td>
                        <td className={`px-4 py-2.5 text-right text-sm font-semibold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>${profit.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${margin >= 40 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : margin >= 20 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'}`}>
                            {margin.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {i < 3 && <Star className={`ml-auto h-4 w-4 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-400' : 'text-amber-700'}`} />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
            <Sparkles className="h-4 w-4 flex-shrink-0 text-brand-500" />
            <p className="text-xs text-slate-500">AI-Powered Data Analysis</p>
          </div>
      </div>
    </div>
  )
}
