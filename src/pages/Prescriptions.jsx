import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { withOfflineCache } from '@/lib/offlineCache'
import { Pill, Search } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import DateInput from '@/components/common/DateInput'
import { formatDateTime } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchPrescriptionDispenses } from '@/lib/db'

const CLASS_BADGE = {
  prescription: { label: 'Prescription', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  controlled: { label: 'Controlled', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
}

const exportColumns = [
  { header: 'Date', key: 'date' },
  { header: 'Product', key: 'product' },
  { header: 'Qty', key: 'qty' },
  { header: 'Class', key: 'classLabel' },
  { header: 'Schedule', key: 'schedule' },
  { header: 'Customer', key: 'customer' },
  { header: 'Prescriber', key: 'prescriber' },
  { header: 'License No.', key: 'licenseNo' },
  { header: 'Branch', key: 'branch' },
  { header: 'Dispensed By', key: 'dispensedBy' },
]

export default function Prescriptions() {
  const { tenant } = useAuthStore()
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const dispensesQuery = useQuery({
    queryKey: ['prescriptionDispenses', tenant?.id],
    queryFn: withOfflineCache(['prescriptionDispenses', tenant?.id], async () => {
      const rows = await fetchPrescriptionDispenses(tenant.id)
      return rows.map((r) => ({
        id: r.id,
        date: r.created_at,
        product: r.products?.name || '—',
        qty: r.qty,
        dispensingClass: r.dispensing_class,
        classLabel: CLASS_BADGE[r.dispensing_class]?.label || r.dispensing_class,
        schedule: r.controlled_schedule || '',
        customer: r.customer_name || '—',
        prescriber: r.prescriber_name,
        licenseNo: r.prescriber_license_no || '',
        branch: r.branches?.name || '—',
        dispensedBy: r.users?.name || '—',
      }))
    }),
    enabled: !!tenant?.id,
    staleTime: 30000,
  })
  const allDispenses = dispensesQuery.data || []
  const loading = dispensesQuery.isLoading

  const filtered = useMemo(() => {
    let rows = allDispenses
    if (dateFrom || dateTo) {
      rows = rows.filter((r) => {
        const d = new Date(r.date)
        if (dateFrom && d < new Date(dateFrom)) return false
        if (dateTo && d > new Date(dateTo + 'T23:59:59')) return false
        return true
      })
    }
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) =>
        r.product.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.prescriber.toLowerCase().includes(q) ||
        r.licenseNo.toLowerCase().includes(q)
      )
    }
    return rows
  }, [allDispenses, search, dateFrom, dateTo])

  const dateFiltered = dateFrom || dateTo

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <Pill className="h-5 w-5 text-brand-600" /> Prescriptions
          </h1>
          <p className="text-sm text-slate-500">Compliance log for every prescription and controlled-substance sale.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" className="w-36" />
          <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" className="w-36" />
          {dateFiltered && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-slate-400 hover:text-red-500">
              Clear
            </button>
          )}
          <ExportMenu
            data={filtered}
            columns={exportColumns}
            title={`Prescriptions${dateFiltered ? ` (${dateFrom || '…'} to ${dateTo || '…'})` : ''}`}
            filename="tengapos_prescriptions"
          />
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, customer, prescriber…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                {['Date', 'Product', 'Qty', 'Class', 'Customer', 'Prescriber', 'License No.', 'Branch', 'Dispensed By'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-12 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-sm text-slate-400">
                  {allDispenses.length === 0 ? 'No prescriptions or controlled-substance sales recorded yet.' : 'No records match your search/filter.'}
                </td></tr>
              ) : filtered.map((r) => {
                const badge = CLASS_BADGE[r.dispensingClass]
                return (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(r.date)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{r.product}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.qty}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge?.bg || 'bg-slate-100 dark:bg-slate-800'} ${badge?.text || 'text-slate-600 dark:text-slate-400'}`}>
                        {r.classLabel}{r.schedule ? ` — Sch. ${r.schedule}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.customer}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.prescriber}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.licenseNo || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.branch}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.dispensedBy}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
