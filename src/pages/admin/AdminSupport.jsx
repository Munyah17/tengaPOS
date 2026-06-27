import { LifeBuoy, Clock, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react'

const MOCK_TICKETS = [
  { id: 'TKT-001', title: 'ZIMRA device not connecting', client: 'Moyo General Store', priority: 'high', status: 'open', time: '2h ago' },
  { id: 'TKT-002', title: 'Receipt printer not printing', client: 'Harare Fresh Market', priority: 'medium', status: 'in_progress', time: '4h ago' },
  { id: 'TKT-003', title: 'Staff login issue after password reset', client: 'Bulawayo Clothing Co.', priority: 'low', status: 'resolved', time: '1d ago' },
  { id: 'TKT-004', title: 'Barcode scanner not recognized', client: 'Zvishavane Hardware', priority: 'medium', status: 'open', time: '5h ago' },
]

const STATUS = {
  open: { icon: AlertCircle, label: 'Open', color: 'text-red-400 bg-red-500/10' },
  in_progress: { icon: Clock, label: 'In Progress', color: 'text-orange-400 bg-orange-500/10' },
  resolved: { icon: CheckCircle2, label: 'Resolved', color: 'text-green-400 bg-green-500/10' },
}

const PRIORITY = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-orange-500/20 text-orange-400',
  low: 'bg-slate-500/20 text-slate-400',
}

export default function AdminSupport() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Support Tickets</h1>
        <p className="mt-1 text-sm text-slate-400">Client issues, field tasks, and tech support requests</p>
      </div>

      {/* Summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Open', count: 2, color: 'text-red-400 bg-red-500/10' },
          { label: 'In Progress', count: 1, color: 'text-orange-400 bg-orange-500/10' },
          { label: 'Resolved', count: 1, color: 'text-green-400 bg-green-500/10' },
          { label: 'Total', count: 4, color: 'text-slate-300 bg-white/5' },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border border-white/10 p-4 ${s.color}`}>
            <p className="text-2xl font-extrabold">{s.count}</p>
            <p className="text-sm font-medium opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tickets */}
      <div className="overflow-hidden rounded-2xl border border-white/10">
        {MOCK_TICKETS.map((ticket, i) => {
          const status = STATUS[ticket.status]
          return (
            <div
              key={ticket.id}
              className={`flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-white/5 sm:flex-row sm:items-center ${
                i < MOCK_TICKETS.length - 1 ? 'border-b border-white/5' : ''
              }`}
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{ticket.id}</span>
                  <span className="font-semibold text-white">{ticket.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY[ticket.priority]}`}>
                    {ticket.priority}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>{ticket.client}</span>
                  <span>{ticket.time}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${status.color}`}>
                  <status.icon className="h-3.5 w-3.5" />
                  {status.label}
                </span>
                <button className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white">
                  <MessageSquare className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-center text-xs text-slate-600">
        Full support ticketing system coming soon. Currently showing sample tickets.
      </p>
    </div>
  )
}
