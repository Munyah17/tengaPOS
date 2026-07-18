import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, Phone, Mail, RefreshCw, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/utils/formatters'
import ExportMenu from '@/components/common/ExportMenu'
import toast from 'react-hot-toast'

const STATUS_LABEL = {
  pending: 'Pending Approval',
  active: 'Active',
  suspended: 'Suspended',
}

const exportColumns = [
  { header: 'Name', key: 'name' },
  { header: 'Phone', key: 'phone' },
  { header: 'Email', key: 'email' },
  { header: 'Business', key: 'business_name' },
  { header: 'Business Type', key: 'business_type' },
  { header: 'Status', key: 'status' },
  { header: 'Plan', key: 'plan_type' },
  { header: 'Signed Up', key: 'signed_up' },
]

// Every client submits their contact details at signup, knowingly and with
// intent to be reachable for support/callbacks — this is that contact list,
// restricted to Admin/Super Admin (never exposed to tenant-side accounts).
export default function AdminMarketing() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, phone, created_at, tenants(name, status, plan_type, pos_mode)')
      .eq('role', 'vendor')
      .order('created_at', { ascending: false })
    if (error) {
      toast.error('Failed to load client list')
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = rows.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (r.name || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.phone || '').toLowerCase().includes(q) ||
      (r.tenants?.name || '').toLowerCase().includes(q)
    )
  })

  const exportRows = filtered.map((r) => ({
    name: r.name,
    phone: r.phone || '',
    email: r.email,
    business_name: r.tenants?.name || '',
    business_type: r.tenants?.pos_mode || '',
    status: STATUS_LABEL[r.tenants?.status] || r.tenants?.status || '',
    plan_type: r.tenants?.plan_type || 'No plan yet',
    signed_up: formatDate(r.created_at),
  }))

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Marketing Database</h1>
          <p className="text-sm text-slate-500">Client contact list — for callbacks and outreach. Admin/Super Admin only.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <ExportMenu data={exportRows} columns={exportColumns} title="Marketing Database" filename="tengapos_marketing_contacts" />
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="rounded-xl bg-brand-100 p-2 text-brand-600 dark:bg-brand-900 dark:text-brand-400">
          <Users className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white">{rows.length}</div>
          <div className="text-xs text-slate-500">Total clients with contact info</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email, or business..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">No clients found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                  {['Name', 'Contact', 'Business', 'Status', 'Plan', 'Signed Up'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{r.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-col gap-0.5">
                        {r.phone ? (
                          <a href={`tel:${r.phone}`} className="flex items-center gap-1.5 text-brand-600 hover:underline dark:text-brand-400">
                            <Phone className="h-3.5 w-3.5" /> {r.phone}
                          </a>
                        ) : (
                          <span className="text-slate-400">No phone on file</span>
                        )}
                        <a href={`mailto:${r.email}`} className="flex items-center gap-1.5 text-slate-500 hover:underline dark:text-slate-400">
                          <Mail className="h-3.5 w-3.5" /> {r.email}
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                      {r.tenants?.name || '—'}
                      {r.tenants?.pos_mode && <span className="ml-1.5 text-xs text-slate-400">({r.tenants.pos_mode})</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {STATUS_LABEL[r.tenants?.status] || r.tenants?.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{r.tenants?.plan_type || 'No plan yet'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{formatDate(r.created_at)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
