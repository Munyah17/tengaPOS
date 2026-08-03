import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { withOfflineCache } from '@/lib/offlineCache'
import { ShieldCheck, Search } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import DateInput, { TimeField } from '@/components/common/DateInput'
import { formatDateTime } from '@/utils/formatters'
import { combineDateAndTime } from '@/utils/dateRanges'
import { useAuthStore } from '@/stores/authStore'
import { fetchAgeVerifications } from '@/lib/db'

const exportColumns = [
  { header: 'Date', key: 'date' },
  { header: 'Product', key: 'product' },
  { header: 'Qty', key: 'qty' },
  { header: 'ID Type', key: 'idType' },
  { header: 'ID Last 4', key: 'idLast4' },
  { header: 'Branch', key: 'branch' },
  { header: 'Verified By', key: 'verifiedBy' },
]

export default function AgeVerifications() {
  const { tenant } = useAuthStore()
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')

  const verificationsQuery = useQuery({
    queryKey: ['ageVerifications', tenant?.id],
    queryFn: withOfflineCache(['ageVerifications', tenant?.id], async () => {
      const rows = await fetchAgeVerifications(tenant.id)
      return rows.map((r) => ({
        id: r.id,
        date: r.created_at,
        product: r.products?.name || '—',
        qty: r.qty,
        idType: r.id_type || '—',
        idLast4: r.id_last4 || '—',
        branch: r.branches?.name || '—',
        verifiedBy: r.users?.name || '—',
      }))
    }),
    enabled: !!tenant?.id,
    staleTime: 30000,
  })
  const allVerifications = verificationsQuery.data || []
  const loading = verificationsQuery.isLoading

  const filtered = useMemo(() => {
    let rows = allVerifications
    if (dateFrom || dateTo) {
      rows = rows.filter((r) => {
        const d = new Date(r.date)
        if (dateFrom && d < combineDateAndTime(dateFrom, timeFrom, '00:00', 0)) return false
        if (dateTo && d > combineDateAndTime(dateTo, timeTo, '23:59', 59.999)) return false
        return true
      })
    }
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((r) => r.product.toLowerCase().includes(q) || r.verifiedBy.toLowerCase().includes(q))
    }
    return rows
  }, [allVerifications, search, dateFrom, dateTo, timeFrom, timeTo])

  const dateFiltered = dateFrom || dateTo

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <ShieldCheck className="h-5 w-5 text-brand-600" /> Age Verifications
          </h1>
          <p className="text-sm text-slate-500">Compliance log for every age-restricted sale.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateInput value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From" className="w-36" />
          <TimeField value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
          <DateInput value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To" className="w-36" />
          <TimeField value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
          {dateFiltered && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeFrom(''); setTimeTo('') }} className="text-slate-400 hover:text-red-500">
              Clear
            </button>
          )}
          <ExportMenu
            data={filtered}
            columns={exportColumns}
            title={`Age Verifications${dateFiltered ? ` (${dateFrom || '…'} to ${dateTo || '…'})` : ''}`}
            filename="tengapos_age_verifications"
          />
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, verified by…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
              <tr>
                {['Date', 'Product', 'Qty', 'ID Type', 'ID Last 4', 'Branch', 'Verified By'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                  {allVerifications.length === 0 ? 'No age-restricted sales recorded yet.' : 'No records match your search/filter.'}
                </td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDateTime(r.date)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{r.product}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.qty}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.idType}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.idLast4}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.branch}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.verifiedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
