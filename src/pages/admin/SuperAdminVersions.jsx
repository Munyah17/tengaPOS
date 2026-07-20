/**
 * Platform version tracker — a real changelog (v1.2, v1.3, …) that Super
 * Admin / Admin can publish from here. Publishing a version does two
 * things atomically: records it in platform_versions (the permanent
 * history), and creates a row in the existing `announcements` table so it
 * flows through the tenant Dashboard exactly like any other announcement —
 * same banner, same per-user dismiss/"don't show again" rules, no second
 * delivery system to maintain.
 */
import { useState, useEffect } from 'react'
import { Rocket, Plus, X, Sparkles, Wrench, TrendingUp, Trash2, Clock, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

const CHANGE_TYPES = {
  new:      { label: 'New',      icon: Sparkles,    color: 'text-green-500',  bg: 'bg-green-500/10' },
  fixed:    { label: 'Fixed',    icon: Wrench,      color: 'text-amber-500',  bg: 'bg-amber-500/10' },
  improved: { label: 'Improved', icon: TrendingUp,  color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
}

// vX.Y → next patch vX.(Y+1); anything unparsable is left for the admin to type
function suggestNextVersion(current) {
  const m = /^v?(\d+)\.(\d+)$/i.exec(current || '')
  if (!m) return 'v1.0'
  return `v${m[1]}.${Number(m[2]) + 1}`
}

function formatAnnouncementBody(changes) {
  return changes
    .map((c) => `${CHANGE_TYPES[c.type]?.label || 'Update'}: ${c.description}`)
    .join('\n')
}

export default function SuperAdminVersions() {
  const { user, role } = useAuthStore()
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)

  const [version, setVersion] = useState('')
  const [title, setTitle] = useState('')
  const [changes, setChanges] = useState([{ type: 'new', description: '' }])

  const load = async () => {
    const { data } = await supabase
      .from('platform_versions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setVersions(data || [])
    setLoading(false)
    if (data?.[0]) setVersion(suggestNextVersion(data[0].version))
    else setVersion('v1.0')
  }

  useEffect(() => { load() }, [])

  const setChange = (i, key, val) =>
    setChanges((prev) => prev.map((c, idx) => idx === i ? { ...c, [key]: val } : c))
  const addChange = () => setChanges((prev) => [...prev, { type: 'new', description: '' }])
  const removeChange = (i) => setChanges((prev) => prev.filter((_, idx) => idx !== i))

  const publish = async (e) => {
    e.preventDefault()
    const cleanChanges = changes.map((c) => ({ ...c, description: c.description.trim() })).filter((c) => c.description)
    if (!version.trim() || !title.trim()) {
      toast.error('Version number and title are required')
      return
    }
    if (cleanChanges.length === 0) {
      toast.error('Add at least one change')
      return
    }
    setPublishing(true)
    try {
      const { data: announcement, error: annErr } = await supabase.from('announcements').insert({
        title: `${version.trim()} — ${title.trim()}`,
        body: formatAnnouncementBody(cleanChanges),
        audience: 'all',
        is_published: true,
        created_by: user?.id,
      }).select('id').single()
      if (annErr) throw annErr

      const { error: verErr } = await supabase.from('platform_versions').insert({
        version: version.trim(),
        title: title.trim(),
        changes: cleanChanges,
        announcement_id: announcement.id,
        created_by: user?.id,
      })
      if (verErr) throw verErr

      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        actor_email: user?.email,
        action: 'platform_version_published',
        target_type: 'platform_version',
        details: { version: version.trim(), title: title.trim(), change_count: cleanChanges.length },
      })

      toast.success(`${version.trim()} published to all tenants`)
      setTitle('')
      setChanges([{ type: 'new', description: '' }])
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to publish update')
    } finally {
      setPublishing(false)
    }
  }

  const remove = async (v) => {
    if (!window.confirm(`Delete ${v.version} from the changelog? Its dashboard announcement is removed too.`)) return
    if (v.announcement_id) await supabase.from('announcements').delete().eq('id', v.announcement_id)
    const { error } = await supabase.from('platform_versions').delete().eq('id', v.id)
    if (error) {
      toast.error(error.message)
    } else {
      setVersions((prev) => prev.filter((x) => x.id !== v.id))
      toast.success('Version removed')
    }
  }

  const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white'

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Version Tracker</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Log every platform update and publish it straight to every tenant's dashboard.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Compose */}
        <form onSubmit={publish} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="mb-4 flex items-center gap-2">
            <Rocket className="h-5 w-5 text-indigo-500" />
            <h2 className="font-bold text-slate-900 dark:text-white">New Update</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Version</label>
              <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.4" className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Receipts Overhaul" className={inputClass} />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-500">What changed</label>
            <div className="mt-1 space-y-2">
              {changes.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <select
                    value={c.type}
                    onChange={(e) => setChange(i, 'type', e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                  >
                    {Object.entries(CHANGE_TYPES).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
                  </select>
                  <input
                    value={c.description}
                    onChange={(e) => setChange(i, 'description', e.target.value)}
                    placeholder="Describe the change…"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  {changes.length > 1 && (
                    <button type="button" onClick={() => removeChange(i)} className="flex-shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addChange}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-indigo-500 hover:text-indigo-600"
            >
              <Plus className="h-3.5 w-3.5" /> Add another change
            </button>
          </div>

          <button
            type="submit"
            disabled={publishing}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Rocket className="h-4 w-4" />
            {publishing ? 'Publishing…' : 'Publish Update'}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Publishes immediately as a dashboard announcement to every tenant.
          </p>
        </form>

        {/* History */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
          ) : versions.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-500">
              <Tag className="h-8 w-8 opacity-30" />
              <span className="text-sm">No versions published yet</span>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((v, i) => (
                <div key={v.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                          i === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                        }`}>
                          {v.version}
                        </span>
                        {i === 0 && (
                          <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-600 dark:text-green-400">CURRENT</span>
                        )}
                        <p className="font-semibold text-slate-900 dark:text-white">{v.title}</p>
                      </div>
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="h-3 w-3" />
                        {new Date(v.created_at).toLocaleString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {(v.changes || []).map((c, ci) => {
                          const meta = CHANGE_TYPES[c.type] || CHANGE_TYPES.new
                          return (
                            <li key={ci} className="flex items-start gap-2 text-sm">
                              <span className={`mt-0.5 flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta.bg} ${meta.color}`}>
                                {meta.label}
                              </span>
                              <span className="text-slate-600 dark:text-slate-300">{c.description}</span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                    {role === 'super_admin' && (
                      <button
                        onClick={() => remove(v)}
                        className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
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
