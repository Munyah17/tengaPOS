import { useEffect, useState } from 'react'
import { Eye, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function SuperAdminCompliance() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('tenant_fiscal_configs')
      .select('*, tenants(name, slug, status)')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setRows(data || [])
        setLoading(false)
      })
  }, [])

  const registered = rows.filter((r) => r.is_registered)
  const enabled = rows.filter((r) => r.is_enabled && !r.is_registered)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">ZIMRA Compliance</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Fiscalisation status across all tenants — device registration and fiscal day state
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Devices Registered', value: registered.length, color: 'text-green-500 bg-green-500/10' },
          { label: 'Enabled, Not Registered', value: enabled.length, color: 'text-amber-500 bg-amber-500/10' },
          { label: 'Configs Total', value: rows.length, color: 'text-slate-500 bg-slate-500/10 dark:text-slate-300' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border border-slate-200 dark:border-white/10 p-4 ${s.color}`}>
            <p className="text-2xl font-extrabold">{s.value}</p>
            <p className="text-xs font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <Eye className="h-8 w-8 opacity-30" />
          <span className="text-sm">No fiscal configurations yet — tenants set these up under Settings → ZIMRA Fiscal</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
          {rows.map((row, i) => (
            <div
              key={row.id}
              className={`flex flex-wrap items-center gap-4 px-5 py-4 ${i < rows.length - 1 ? 'border-b border-slate-100 dark:border-white/5' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 dark:text-white">{row.tenants?.name || 'Unknown tenant'}</p>
                <p className="text-xs text-slate-500">
                  {row.device_id ? `Device ${row.device_id}` : 'No device ID'}
                  {row.tin && ` · TIN ${row.tin}`}
                  {row.vat_number && ` · VAT ${row.vat_number}`}
                </p>
              </div>
              <span className="text-xs text-slate-500">{row.fiscal_day_status?.replace('FiscalDay', 'Day ')}</span>
              {row.is_registered ? (
                <span className="flex items-center gap-1.5 rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-600 dark:text-green-400">
                  <CheckCircle className="h-3.5 w-3.5" /> Registered
                </span>
              ) : row.is_enabled ? (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> Not Registered
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-slate-500/15 px-3 py-1 text-xs font-semibold text-slate-500">
                  <XCircle className="h-3.5 w-3.5" /> Disabled
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
