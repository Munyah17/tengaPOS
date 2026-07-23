import { useState, useEffect, useMemo } from 'react'
import { Car, User, Phone, Search, ChevronRight, Wrench, Calendar, Lightbulb } from 'lucide-react'
import ExportMenu from '@/components/common/ExportMenu'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'
import { fetchCustomers, fetchJobCards } from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'

// The CRM view: every customer, their vehicle(s), and each vehicle's full
// service history (what was done, when, and what's recommended for next
// time) -- what the workshop's front desk uses to upsell and follow up.
export default function VehicleRegistry() {
  const { tenant } = useAuthStore()
  const [customers, setCustomers] = useState([])
  const [jobCards, setJobCards] = useState([])
  const [search, setSearch] = useState('')
  const [selectedVehicle, setSelectedVehicle] = useState(null)

  useEffect(() => {
    if (!tenant?.id) return
    loadWithOfflineCache(['customers', tenant.id], () => fetchCustomers(tenant.id), { onData: setCustomers })
    loadWithOfflineCache(['jobCards', tenant.id], () => fetchJobCards(tenant.id), { onData: setJobCards })
  }, [tenant?.id])

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.vehicles?.some((v) => [v.make, v.model, v.reg_number].join(' ').toLowerCase().includes(q)))
  }, [customers, search])

  const historyFor = (vehicleId) => jobCards
    .filter((j) => j.vehicle_id === vehicleId && j.status === 'completed')
    .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))

  const exportRows = useMemo(() => filteredCustomers.flatMap((c) => (c.vehicles || []).map((v) => ({
    customer: c.name,
    phone: c.phone || '',
    vehicle: [v.make, v.model, v.year].filter(Boolean).join(' '),
    reg_number: v.reg_number || '',
    services: historyFor(v.id).length,
  }))), [filteredCustomers, jobCards])
  const exportColumns = [
    { header: 'Customer', key: 'customer' },
    { header: 'Phone', key: 'phone' },
    { header: 'Vehicle', key: 'vehicle' },
    { header: 'Reg Number', key: 'reg_number' },
    { header: 'Services', key: 'services' },
  ]

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Vehicle Registry</h1>
          <p className="text-sm text-slate-500">Customers, their vehicles, and full service history</p>
        </div>
        <ExportMenu data={exportRows} columns={exportColumns} title="Vehicle Registry" filename="vehicle_registry" />
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, phone, or reg number…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-700">
          <Car className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500">No customers yet — they're added from a Job Card</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCustomers.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                <span className="font-bold text-slate-900 dark:text-white">{c.name}</span>
                {c.phone && <span className="flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" />{c.phone}</span>}
              </div>
              {(c.vehicles || []).length === 0 ? (
                <p className="ml-6 text-xs text-slate-400">No vehicles on record</p>
              ) : (
                <div className="ml-6 space-y-1.5">
                  {c.vehicles.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVehicle(v)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-left text-sm hover:border-amber-300 hover:bg-amber-50/50 dark:border-slate-800 dark:hover:border-amber-700 dark:hover:bg-amber-950/20"
                    >
                      <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Car className="h-3.5 w-3.5 text-slate-400" />
                        {[v.make, v.model, v.year].filter(Boolean).join(' ') || 'Vehicle'}
                        {v.reg_number && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">{v.reg_number}</span>}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        {historyFor(v.id).length} service{historyFor(v.id).length !== 1 ? 's' : ''} <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedVehicle(null)} />
          <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {[selectedVehicle.make, selectedVehicle.model, selectedVehicle.year].filter(Boolean).join(' ') || 'Vehicle'}
                </h2>
                {selectedVehicle.reg_number && <p className="font-mono text-xs text-slate-500">{selectedVehicle.reg_number}</p>}
              </div>
              <button onClick={() => setSelectedVehicle(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {historyFor(selectedVehicle.id).length === 0 ? (
                <p className="text-sm text-slate-400">No completed jobs yet for this vehicle</p>
              ) : historyFor(selectedVehicle.id).map((jc) => (
                <div key={jc.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                      <Calendar className="h-3.5 w-3.5" /> {formatDate(jc.completed_at || jc.created_at)}
                    </span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(jc.total)}</span>
                  </div>
                  <p className="mb-1 flex items-start gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                    <Wrench className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                    {jc.description || (jc.items || []).map((i) => i.description).join(', ')}
                  </p>
                  {jc.recommendations && (
                    <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> {jc.recommendations}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
