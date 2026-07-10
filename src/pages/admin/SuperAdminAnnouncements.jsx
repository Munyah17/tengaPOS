import { useEffect, useState } from 'react'
import { Bell, Send, Trash2, Megaphone, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

const AUDIENCES = [
  { key: 'all', label: 'All tenants' },
  { key: 'active', label: 'Active tenants' },
  { key: 'pending', label: 'Pending tenants' },
]

export default function SuperAdminAnnouncements() {
  const { user, role } = useAuthStore()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('all')
  const [sending, setSending] = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setAnnouncements(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const send = async (e) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      toast.error('Title and message are required')
      return
    }
    setSending(true)
    const { error } = await supabase.from('announcements').insert({
      title: title.trim(),
      body: body.trim(),
      audience,
      is_published: true,
      created_by: user?.id,
    })
    if (error) {
      toast.error(error.message)
    } else {
      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        actor_email: user?.email,
        action: 'announcement_sent',
        target_type: 'announcement',
        details: { title: title.trim(), audience },
      })
      toast.success('Announcement broadcast to tenants')
      setTitle('')
      setBody('')
      load()
    }
    setSending(false)
  }

  const remove = async (id) => {
    const { error } = await supabase.from('announcements').delete().eq('id', id)
    if (error) {
      toast.error(error.message)
    } else {
      setAnnouncements((prev) => prev.filter((a) => a.id !== id))
      toast.success('Announcement removed')
    }
  }

  const togglePublish = async (a) => {
    const { error } = await supabase
      .from('announcements')
      .update({ is_published: !a.is_published })
      .eq('id', a.id)
    if (error) {
      toast.error(error.message)
    } else {
      setAnnouncements((prev) => prev.map((x) => x.id === a.id ? { ...x, is_published: !a.is_published } : x))
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Announcements</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Broadcast system messages to tenant dashboards — maintenance windows, new features, notices
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Compose */}
        <form onSubmit={send} className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5 h-fit">
          <div className="mb-4 flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-indigo-500" />
            <h2 className="font-bold text-slate-900 dark:text-white">New Announcement</h2>
          </div>

          <label className="text-xs font-semibold text-slate-500">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Scheduled maintenance Saturday 22:00"
            className="mt-1 mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />

          <label className="text-xs font-semibold text-slate-500">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="What tenants will see on their dashboard…"
            className="mt-1 mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />

          <label className="text-xs font-semibold text-slate-500">Audience</label>
          <div className="mt-1 mb-4 flex gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.key}
                type="button"
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

          <button
            type="submit"
            disabled={sending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Broadcasting…' : 'Broadcast Now'}
          </button>
        </form>

        {/* History */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
          ) : announcements.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
              <Bell className="h-8 w-8 opacity-30" />
              <span className="text-sm">No announcements sent yet</span>
            </div>
          ) : (
            <div className="space-y-2">
              {announcements.map((a) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900 dark:text-white">{a.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          a.is_published
                            ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                            : 'bg-slate-500/15 text-slate-500'
                        }`}>
                          {a.is_published ? 'LIVE' : 'HIDDEN'}
                        </span>
                        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-500">
                          {AUDIENCES.find((x) => x.key === a.audience)?.label || a.audience}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{a.body}</p>
                      <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {new Date(a.created_at).toLocaleString('en-ZW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 gap-1">
                      <button
                        onClick={() => togglePublish(a)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                      >
                        {a.is_published ? 'Hide' : 'Publish'}
                      </button>
                      {role === 'super_admin' && (
                        <button
                          onClick={() => remove(a.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
