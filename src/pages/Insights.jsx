import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, TrendingUp, TrendingDown, Package, DollarSign, AlertCircle,
  Download, RefreshCw, MapPin, Calendar, ChevronDown, ChevronUp,
  FileText, Table, Printer, Lightbulb, Target, ShoppingCart, BarChart3,
  Star, ArrowUp, ArrowDown, Minus, Eye, EyeOff,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import Papa from 'papaparse'

// ─── Demo product data ────────────────────────────────────────────────────────
const DEMO_RETAIL = [
  { name: 'Coca-Cola 500ml',     category: 'Beverages',  sold: 312, revenue: 624.00,  cost: 350.00, returnRate: 0.01 },
  { name: 'Bread (700g)',         category: 'Bakery',     sold: 285, revenue: 713.00,  cost: 427.50, returnRate: 0.02 },
  { name: 'Eggs (18-pack)',       category: 'Dairy',      sold: 198, revenue: 1188.00, cost: 891.00, returnRate: 0.00 },
  { name: 'Maggi Noodles',        category: 'Dry Goods',  sold: 176, revenue: 264.00,  cost: 176.00, returnRate: 0.01 },
  { name: 'Washing Powder 2kg',  category: 'Household',  sold: 134, revenue: 1072.00, cost: 804.00, returnRate: 0.03 },
  { name: 'Mazoe Orange 2L',     category: 'Beverages',  sold: 89,  revenue: 534.00,  cost: 356.00, returnRate: 0.01 },
  { name: 'Sugar 2kg',           category: 'Dry Goods',  sold: 67,  revenue: 469.00,  cost: 335.00, returnRate: 0.00 },
  { name: 'Cooking Oil 2L',      category: 'Cooking',    sold: 54,  revenue: 702.00,  cost: 540.00, returnRate: 0.00 },
  { name: 'Baked Beans 400g',    category: 'Canned',     sold: 43,  revenue: 129.00,  cost: 86.00,  returnRate: 0.02 },
  { name: 'Rice 5kg',            category: 'Dry Goods',  sold: 38,  revenue: 570.00,  cost: 380.00, returnRate: 0.01 },
  { name: 'Milk 1L',             category: 'Dairy',      sold: 32,  revenue: 128.00,  cost: 96.00,  returnRate: 0.00 },
  { name: 'Detergent 750ml',     category: 'Household',  sold: 21,  revenue: 189.00,  cost: 147.00, returnRate: 0.01 },
]

const DEMO_RESTAURANT = [
  { name: 'Sadza & Chicken',     category: 'Mains',      sold: 287, revenue: 2296.00, cost: 1148.00, returnRate: 0.00 },
  { name: 'Zinger Burger',       category: 'Burgers',    sold: 243, revenue: 2187.00, cost: 972.00,  returnRate: 0.01 },
  { name: 'Grilled Tilapia',     category: 'Mains',      sold: 198, revenue: 2376.00, cost: 1188.00, returnRate: 0.01 },
  { name: 'Streetwise 2',        category: 'Combos',     sold: 176, revenue: 2112.00, cost: 880.00,  returnRate: 0.00 },
  { name: 'Chips Large',         category: 'Sides',      sold: 312, revenue: 936.00,  cost: 312.00,  returnRate: 0.01 },
  { name: 'Mazoe Orange',        category: 'Drinks',     sold: 198, revenue: 396.00,  cost: 148.50, returnRate: 0.00 },
  { name: 'Family Bucket',       category: 'Combos',     sold: 89,  revenue: 3115.00, cost: 1424.00, returnRate: 0.00 },
  { name: 'Beef Stew & Rice',    category: 'Mains',      sold: 134, revenue: 1474.00, cost: 804.00,  returnRate: 0.02 },
  { name: 'Veggie Wrap',         category: 'Light',      sold: 67,  revenue: 670.00,  cost: 335.00,  returnRate: 0.01 },
  { name: 'Ice Cream Cone',      category: 'Desserts',   sold: 43,  revenue: 215.00,  cost: 86.00,   returnRate: 0.00 },
]

const TIMELINES = [
  { key: 'today',    label: 'Today',           multiplier: 1 / 30 },
  { key: 'week',     label: 'This Week',        multiplier: 7 / 30 },
  { key: 'month',    label: 'This Month',       multiplier: 1 },
  { key: '3months',  label: 'Last 3 Months',    multiplier: 3 },
  { key: 'year',     label: 'This Year',        multiplier: 12 },
]

// Trend figures per timeline (vs previous equivalent period)
const TIMELINE_TRENDS = {
  today:   { revenue: 4,  profit: 2,  units: 3 },
  week:    { revenue: 8,  profit: 6,  units: 7 },
  month:   { revenue: 12, profit: 8,  units: 5 },
  '3months': { revenue: 18, profit: 14, units: 11 },
  year:    { revenue: 23, profit: 19, units: 15 },
}

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

async function callGroq(prompt, apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.7,
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content: 'You are a sharp business intelligence advisor for African SMEs. Respond ONLY with valid JSON matching the requested schema. No extra text.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Groq API error ${res.status}`)
  }
  const data = await res.json()
  const text = data.choices[0]?.message?.content || ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI returned unexpected format')
  return JSON.parse(match[0])
}

function buildPrompt(products, timeline, location, landingPrices, posMode) {
  const top = [...products].sort((a, b) => b.sold - a.sold).slice(0, 8)
  const slow = [...products].sort((a, b) => a.sold - b.sold).slice(0, 4)
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  const totalProfit = products.reduce((s, p) => s + (p.revenue - p.cost), 0)
  const type = posMode === 'restaurant' ? 'restaurant/food service' : 'retail shop'

  const pricingSection = Object.entries(landingPrices).length > 0
    ? `\nLANDING (COST) PRICES ENTERED BY USER:\n${Object.entries(landingPrices).map(([n, c]) => `- ${n}: $${c}`).join('\n')}\n`
    : ''

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
${pricingSection}
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
  const { isDemo, profile, tenant } = useAuthStore()
  const { posMode } = useThemeStore()
  const isRestaurant = posMode === 'restaurant'
  const baseProducts = isDemo ? (isRestaurant ? DEMO_RESTAURANT : DEMO_RETAIL) : []

  const [timeline, setTimeline] = useState('month')
  const [location, setLocation] = useState('')
  const [landingPrices, setLandingPrices] = useState({})
  const [showPricing, setShowPricing] = useState(false)
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_GROQ_API_KEY || '')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const reportRef = useRef(null)

  const tlMeta = TIMELINES.find((t) => t.key === timeline) || TIMELINES[2]
  const m = tlMeta.multiplier
  const trends = TIMELINE_TRENDS[timeline] || TIMELINE_TRENDS.month

  // Scale demo data to match the selected period
  const products = baseProducts.map((p) => ({
    ...p,
    sold:    Math.round(p.sold    * m),
    revenue: +(p.revenue * m).toFixed(2),
    cost:    +(p.cost    * m).toFixed(2),
  }))

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  const totalProfit  = products.reduce((s, p) => s + (p.revenue - p.cost), 0)
  const totalUnits   = products.reduce((s, p) => s + p.sold, 0)

  const generateInsights = async () => {
    if (!apiKey.trim()) { toast.error('Enter your Groq API key below to use AI insights'); return }
    if (products.length === 0) { toast.error('No product data available'); return }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const prompt = buildPrompt(products, tlMeta.label, location, landingPrices, posMode)
      const data = await callGroq(prompt, apiKey)
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
    doc.text(`Generated: ${new Date().toLocaleDateString()} | Location: ${location || 'Zimbabwe'}`, 14, 28)
    autoTable(doc, {
      startY: 35,
      head: [['Product', 'Category', 'Units', 'Revenue', 'Cost', 'Profit', 'Margin']],
      body: products.map(p => [
        p.name, p.category, p.sold, `$${p.revenue.toFixed(2)}`,
        `$${p.cost.toFixed(2)}`, `$${(p.revenue - p.cost).toFixed(2)}`,
        `${((p.revenue - p.cost) / p.revenue * 100).toFixed(1)}%`,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
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

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">AI Insights</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">Powered by LLaMA 3.3 (Groq) — free, open-source model</p>
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
        <Metric label="Total Revenue" value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={DollarSign} color="brand" trend={trends.revenue} sub={tlMeta.label} />
        <Metric label="Gross Profit"  value={`$${totalProfit.toLocaleString(undefined,  { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={TrendingUp}  color="green"  trend={trends.profit}  sub={`${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}% margin`} />
        <Metric label="Units Sold"    value={totalUnits.toLocaleString()}            icon={ShoppingCart} color="purple" trend={trends.units} />
        <Metric label="Products Active" value={baseProducts.length}                  icon={Package}      color="amber"  sub="All categories" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: product table */}
        <div>
          {/* Location + pricing input */}
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
            <button
              onClick={() => setShowPricing((v) => !v)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <DollarSign className="h-4 w-4" />
              Enter Landing Prices
              {showPricing ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          <AnimatePresence>
            {showPricing && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">Landing Prices (your cost price)</p>
                  <p className="text-xs text-slate-500">AI will use these to suggest sell prices with market context</p>
                </div>
                <div className="grid gap-2 p-4 sm:grid-cols-2">
                  {products.slice(0, 8).map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">{p.name}</span>
                      <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
                        <span className="border-r border-slate-200 px-2 py-1 text-xs text-slate-400 dark:border-slate-700">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={landingPrices[p.name] || ''}
                          onChange={(e) => setLandingPrices(prev => ({ ...prev, [p.name]: e.target.value }))}
                          className="w-20 bg-transparent px-2 py-1 text-sm focus:outline-none dark:text-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Product performance table */}
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
                  {[...products].sort((a, b) => b.revenue - a.revenue).map((p, i) => {
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

          {/* API Key input */}
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-white">Groq API Key</span>
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700 dark:bg-green-900/40 dark:text-green-400">Free</span>
            </div>
            <p className="mb-3 text-xs text-slate-500">Get a free key at <strong>console.groq.com</strong> (no credit card needed). Uses LLaMA 3.3 70B — open source.</p>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="gsk_..."
                  className="flex-1 bg-transparent px-3 py-2 text-sm font-mono text-slate-700 placeholder-slate-400 focus:outline-none dark:text-white"
                />
                <button onClick={() => setShowKey(v => !v)} className="px-2 text-slate-400">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-400">Or set <code className="text-brand-500">VITE_GROQ_API_KEY</code> in .env</p>
            </div>
          </div>
        </div>

        {/* Right: AI results */}
        <div className="space-y-4">
          {!result && !loading && !error && (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center dark:border-slate-700">
              <Sparkles className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
              <p className="font-semibold text-slate-500">AI analysis ready</p>
              <p className="mt-1 text-xs text-slate-400">Set your timeline, location, and optional landing prices, then click Generate Insights</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-slate-900">
              <RefreshCw className="mb-3 h-8 w-8 animate-spin text-brand-500" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Analysing your business data…</p>
              <p className="mt-1 text-xs text-slate-400">LLaMA 3.3 70B is reviewing your products and market context</p>
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
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
