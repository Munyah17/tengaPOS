import { useEffect, useState } from 'react'
import { LifeBuoy, Clock, CheckCircle2, AlertCircle, Plus, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

const STATUS = {
  open:        { icon: AlertCircle,  label: 'Open',        color: 'text-red-500 bg-red-500/10' },
  in_progress: { icon: Clock,        label: 'In Progress', color: 'text-orange-500 bg-orange-500/10' },
  resolved:    { icon: CheckCircle2, label: 'Resolved',    color: 'text-green-500 bg-green-500/10' },
  closed:      { icon: CheckCircle2, label: 'Closed',      color: 'text-slate-500 bg-slate-500/10' },
}

const PRIORITY = {
  high:   'bg-red-500/20 text-red-500',
  medium: 'bg-orange-500/20 text-orange-500',
  low:    'bg-slate-500/20 text-slate-500',
}

const NEXT_STATUS = { open: 'in_progress', in_progress: 'resolved', resolved: 'closed', closed: 'open' }

function NewTicketModal({ tenants, onClose, onCreated }) {
  const { user } = useAuthStore()
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [tenantId, setTenantId] = useState('')
  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    if (!subject.trim()) { toast.error('Subject is required'); return }
    setSaving(true)
    const { error } = await supabase.from('support_tickets').insert({
      subject: subject.trim(),
      description: description.trim() || null,
      priority,
      tenant_id: tenantId || null,
      created_by: user?.id,
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Ticket logged')
      onCreated()
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <form onSubmit={create} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-white">Log Support Ticket</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="text-xs font-semibold text-slate-500">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Receipt printer not printing"
          className="mt-1 mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
        />

        <label className="text-xs font-semibold text-slate-500">Tenant (optional)</label>
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="mt-1 mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
        >
          <option value="">— No tenant / internal —</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <label className="text-xs font-semibold text-slate-500">Priority</label>
        <div className="mt-1 mb-3 flex gap-2">
          {['low', 'medium', 'high'].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                priority === p ? PRIORITY[p] : 'bg-slate-100 text-slate-500 dark:bg-white/5'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <label className="text-xs font-semibold text-slate-500">Details (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 mb-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
        />

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Log Ticket'}
        </button>
      </form>
    </div>
  )
}

export default function AdminSupport() {
  const [tickets, setTickets] = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const load = async () => {
    const [{ data: ticketData }, { data: tenantData }] = await Promise.all([
      supabase.from('support_tickets').select('*, tenants(name)').order('created_at', { ascending: false }).limit(200),
      supabase.from('tenants').select('id, name').order('name'),
    ])
    setTickets(ticketData || [])
    setTenants(tenantData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const advanceStatus = async (ticket) => {
    const next = NEXT_STATUS[ticket.status]
    const { error } = await supabase
      .from('support_tickets')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', ticket.id)
    if (error) {
      toast.error(error.message)
    } else {
      setTickets((prev) => prev.map((t) => t.id === ticket.id ? { ...t, status: next } : t))
    }
  }

  const counts = {
    open: tickets.filter((t) => t.status === 'open').length,
    in_progress: tickets.filter((t) => t.status === 'in_progress').length,
    resolved: tickets.filter((t) => t.status === 'resolved').length,
    total: tickets.length,
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Support Tickets</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Client issues, field tasks, and tech support requests</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Log Ticket
        </button>
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Open', count: counts.open, color: 'text-red-500 bg-red-500/10' },
          { label: 'In Progress', count: counts.in_progress, color: 'text-orange-500 bg-orange-500/10' },
          { label: 'Resolved', count: counts.resolved, color: 'text-green-500 bg-green-500/10' },
          { label: 'Total', count: counts.total, color: 'text-slate-600 bg-slate-500/10 dark:text-slate-300' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border border-slate-200 dark:border-white/10 p-4 ${s.color}`}>
            <p className="text-2xl font-extrabold">{s.count}</p>
            <p className="text-sm font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tickets */}
      {loading ? (
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
          <LifeBuoy className="h-8 w-8 opacity-30" />
          <span className="text-sm">No support tickets — log one when a client reports an issue</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
          {tickets.map((ticket, i) => {
            const status = STATUS[ticket.status] || STATUS.open
            return (
              <div
                key={ticket.id}
                className={`flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50 dark:hover:bg-white/5 sm:flex-row sm:items-center ${
                  i < tickets.length - 1 ? 'border-b border-slate-100 dark:border-white/5' : ''
                }`}
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">TKT-{String(ticket.ticket_no).padStart(4, '0')}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{ticket.subject}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY[ticket.priority]}`}>
                      {ticket.priority}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    {ticket.tenants?.name && <span>{ticket.tenants.name}</span>}
                    <span>{new Date(ticket.created_at).toLocaleString('en-ZW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {ticket.description && (
                    <p className="mt-1 text-xs text-slate-500">{ticket.description}</p>
                  )}
                </div>
                <button
                  onClick={() => advanceStatus(ticket)}
                  title={`Mark as ${STATUS[NEXT_STATUS[ticket.status]]?.label}`}
                  className={`flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-75 sm:self-auto ${status.color}`}
                >
                  <status.icon className="h-3.5 w-3.5" />
                  {status.label}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showNew && (
        <NewTicketModal
          tenants={tenants}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); load() }}
        />
      )}
    </div>
  )
}
