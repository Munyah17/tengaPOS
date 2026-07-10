import { useEffect, useState } from 'react'
import { Mail, Users, Copy, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

const AUDIENCES = [
  { key: 'all', label: 'All tenants' },
  { key: 'active', label: 'Active only' },
  { key: 'pending', label: 'Pending only' },
]

export default function SuperAdminBroadcasts() {
  const [recipients, setRecipients] = useState([])
  const [loading, setLoading] = useState(true)
  const [audience, setAudience] = useState('all')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Owner (vendor) account of every tenant, with tenant status for filtering
    supabase
      .from('users')
      .select('email, name, tenant_id, role, tenants(name, status)')
      .eq('role', 'vendor')
      .then(({ data }) => {
        setRecipients((data || []).filter((u) => u.email))
        setLoading(false)
      })
  }, [])

  const filtered = recipients.filter((r) => {
    if (audience === 'all') return true
    return r.tenants?.status === audience
  })
  const emails = [...new Set(filtered.map((r) => r.email))]

  const copyEmails = async () => {
    await navigator.clipboard.writeText(emails.join(', '))
    toast.success(`${emails.length} addresses copied`)
  }

  const openMailClient = () => {
    if (emails.length === 0) {
      toast.error('No recipients for this audience')
      return
    }
    const url = `mailto:?bcc=${encodeURIComponent(emails.join(','))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    window.location.href = url
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Email Broadcasts</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Email all tenant owners. Recipients are pulled live from the database and BCC'd for privacy.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Compose */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <label className="text-xs font-semibold text-slate-500">Audience</label>
          <div className="mt-1 mb-4 flex gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.key}
                onClick={() => setAudience(a.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  audience === a.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          <label className="text-xs font-semibold text-slate-500">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. New feature: HR & Payroll now available"
            className="mt-1 mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />

          <label className="text-xs font-semibold text-slate-500">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            placeholder="Write the email body…"
            className="mt-1 mb-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={openMailClient}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Email Client ({emails.length} recipients)
            </button>
            <button
              onClick={copyEmails}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              <Copy className="h-4 w-4" />
              Copy Addresses
            </button>
          </div>
        </div>

        {/* Recipient list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Recipients ({emails.length})</h2>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-slate-500">
              <Mail className="h-6 w-6 opacity-30" />
              <p className="text-xs">No tenant owners match this audience</p>
            </div>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {filtered.map((r, i) => (
                <div key={`${r.email}-${i}`} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-white/5">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{r.name || r.email}</p>
                  <p className="truncate text-[11px] text-slate-500">{r.email} · {r.tenants?.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
