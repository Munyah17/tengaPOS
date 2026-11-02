import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound, Plus, Copy, Check, Ban, RefreshCw, Trash2, Building2,
  ShieldCheck, Globe, Clock, Activity, X, AlertTriangle, BookOpen,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { generateApiKey, API_SCOPES } from '@/lib/apiKeys'

const PUBLISHABLE_SCOPES = API_SCOPES.filter((s) => s.publishable).map((s) => s.id)

function KeyTypeBadge({ type }) {
  const pub = type === 'publishable'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
      pub
        ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
        : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
    }`}>
      {pub ? <Globe className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {pub ? 'Publishable' : 'Integration'}
    </span>
  )
}

function StatusBadge({ key_ }) {
  if (key_.status === 'revoked') {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">Revoked</span>
  }
  if (key_.expires_at && new Date(key_.expires_at) < new Date()) {
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Expired</span>
  }
  return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">Active</span>
}

export default function SuperAdminApiKeys() {
  const { user } = useAuthStore()
  const [keys, setKeys] = useState([])
  const [tenants, setTenants] = useState([])
  const [usage, setUsage] = useState({})
  const [loading, setLoading] = useState(true)
  const [showIssue, setShowIssue] = useState(false)
  const [newKey, setNewKey] = useState(null) // { rawKey, row }
  const [copied, setCopied] = useState(false)
  const [detailKey, setDetailKey] = useState(null)

  const [form, setForm] = useState({
    tenant_id: '', organisation: '', contact_name: '', contact_email: '',
    label: '', key_type: 'integration', scopes: [...PUBLISHABLE_SCOPES],
    rate_limit_per_minute: 120, expires_in_days: '', allowed_origins: '', notes: '',
  })
  const [issuing, setIssuing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: k }, { data: t }] = await Promise.all([
      supabase.from('api_keys')
        .select('id, tenant_id, organisation, contact_name, contact_email, label, key_type, public_id, last4, scopes, rate_limit_per_minute, status, expires_at, last_used_at, created_at, notes, allowed_origins')
        .order('created_at', { ascending: false }),
      supabase.from('tenants').select('id, name').eq('is_active', true).order('name'),
    ])
    setKeys(k || [])
    setTenants(t || [])

    // Per-key request counts over the last 24h for the usage column.
    if (k?.length) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { data: logs } = await supabase
        .from('api_request_logs')
        .select('api_key_id')
        .gte('created_at', since)
      const counts = {}
      ;(logs || []).forEach((l) => { counts[l.api_key_id] = (counts[l.api_key_id] || 0) + 1 })
      setUsage(counts)
    }
    setLoading(false)
  }, [])

  // Defer one tick so the synchronous setLoading(true) inside load()
  // doesn't run inside the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  const tenantName = useMemo(() => {
    const map = {}
    tenants.forEach((t) => { map[t.id] = t.name })
    return map
  }, [tenants])

  const toggleScope = (id) => {
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(id) ? f.scopes.filter((s) => s !== id) : [...f.scopes, id],
    }))
  }

  const issueKey = async () => {
    if (!form.tenant_id) return toast.error('Select the tenant this key may access')
    if (!form.organisation.trim()) return toast.error('Enter the developer / organisation name')
    if (form.key_type === 'integration' && form.scopes.length === 0) {
      return toast.error('Grant at least one scope')
    }
    setIssuing(true)
    try {
      const { rawKey, publicId, keyHash, last4 } = await generateApiKey(form.key_type)
      const days = parseInt(form.expires_in_days, 10)
      const row = {
        tenant_id: form.tenant_id,
        organisation: form.organisation.trim(),
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        label: form.label.trim(),
        key_type: form.key_type,
        public_id: publicId,
        key_hash: keyHash,
        last4,
        scopes: form.key_type === 'publishable' ? PUBLISHABLE_SCOPES : form.scopes,
        rate_limit_per_minute: Math.max(1, Math.min(10000, form.rate_limit_per_minute || 120)),
        allowed_origins: form.allowed_origins
          ? form.allowed_origins.split(',').map((o) => o.trim()).filter(Boolean)
          : null,
        expires_at: Number.isFinite(days) && days > 0
          ? new Date(Date.now() + days * 24 * 3600 * 1000).toISOString()
          : null,
        notes: form.notes.trim() || null,
        created_by: user?.id || null,
      }
      const { data, error } = await supabase.from('api_keys').insert(row).select('id').single()
      if (error) throw error

      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        actor_email: user?.email,
        action: 'api_key_issued',
        target_type: 'api_key',
        target_id: data.id,
        details: {
          tenant: tenantName[form.tenant_id],
          organisation: row.organisation,
          key_type: row.key_type,
          scopes: row.scopes,
        },
      })

      setNewKey({ rawKey, row: { ...row, id: data.id } })
      setShowIssue(false)
      setForm({
        tenant_id: '', organisation: '', contact_name: '', contact_email: '',
        label: '', key_type: 'integration', scopes: [...PUBLISHABLE_SCOPES],
        rate_limit_per_minute: 120, expires_in_days: '', allowed_origins: '', notes: '',
      })
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to issue key')
    } finally {
      setIssuing(false)
    }
  }

  const revoke = async (key) => {
    if (!confirm(`Revoke ${key.public_id}? Requests with this key will start failing immediately.`)) return
    const { error } = await supabase.from('api_keys')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: user?.id, updated_at: new Date().toISOString() })
      .eq('id', key.id)
    if (error) return toast.error(error.message)
    await supabase.from('audit_logs').insert({
      actor_id: user?.id, actor_email: user?.email,
      action: 'api_key_revoked', target_type: 'api_key', target_id: key.id,
      details: { public_id: key.public_id, organisation: key.organisation },
    })
    toast.success('Key revoked')
    load()
  }

  const reinstate = async (key) => {
    const { error } = await supabase.from('api_keys')
      .update({ status: 'active', revoked_at: null, revoked_by: null, updated_at: new Date().toISOString() })
      .eq('id', key.id)
    if (error) return toast.error(error.message)
    toast.success('Key reinstated')
    load()
  }

  const rotate = async (key) => {
    if (!confirm(`Rotate ${key.public_id}? A fresh key will be issued with the same settings and this one revoked.`)) return
    try {
      const { rawKey, publicId, keyHash, last4 } = await generateApiKey(key.key_type)
      const { error: insErr } = await supabase.from('api_keys').insert({
        tenant_id: key.tenant_id,
        organisation: key.organisation,
        contact_name: key.contact_name,
        contact_email: key.contact_email,
        label: key.label,
        key_type: key.key_type,
        public_id: publicId,
        key_hash: keyHash,
        last4,
        scopes: key.scopes,
        rate_limit_per_minute: key.rate_limit_per_minute,
        allowed_origins: key.allowed_origins,
        expires_at: key.expires_at,
        notes: `Rotated replacement for ${key.public_id}`,
        created_by: user?.id,
      }).select('id').single()
      if (insErr) throw insErr
      await supabase.from('api_keys')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: user?.id, notes: `${key.notes ? key.notes + ' ' : ''}Rotated → ${publicId}` })
        .eq('id', key.id)
      await supabase.from('audit_logs').insert({
        actor_id: user?.id, actor_email: user?.email,
        action: 'api_key_rotated', target_type: 'api_key', target_id: key.id,
        details: { old_public_id: key.public_id, new_public_id: publicId, organisation: key.organisation },
      })
      setNewKey({ rawKey, row: { public_id: publicId, key_type: key.key_type, organisation: key.organisation } })
      load()
    } catch (err) {
      toast.error(err.message || 'Rotation failed')
    }
  }

  const removeKey = async (key) => {
    if (!confirm(`Permanently delete ${key.public_id}? This cannot be undone.`)) return
    const { error } = await supabase.from('api_keys').delete().eq('id', key.id)
    if (error) return toast.error(error.message)
    toast.success('Key deleted')
    load()
  }

  const copyKey = () => {
    navigator.clipboard.writeText(newKey.rawKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white'

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            <KeyRound className="h-6 w-6 text-indigo-500" /> Public API Keys
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Issue <span className="font-semibold">Publishable</span> and <span className="font-semibold">Integration</span> keys
            to authorised developers and organisations. Only the Super Admin can issue or revoke keys.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/developers"
            target="_blank"
            className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <BookOpen className="h-4 w-4" /> API Docs
          </Link>
          <button
            onClick={() => setShowIssue(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" /> Issue Key
          </button>
        </div>
      </div>

      {/* Key list */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-widest text-slate-500 dark:border-white/10 dark:text-slate-400">
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Requests 24h</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last used</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
              )}
              {!loading && keys.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                  No API keys issued yet. Click <span className="font-semibold">Issue Key</span> to onboard a developer.
                </td></tr>
              )}
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5">
                  <td className="px-4 py-3">
                    <button onClick={() => setDetailKey(k)} className="text-left">
                      <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">{k.public_id}•••{k.last4}</span>
                      {k.label && <p className="text-xs text-slate-500">{k.label}</p>}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{k.organisation}</p>
                    {k.contact_email && <p className="text-xs text-slate-500">{k.contact_email}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      {tenantName[k.tenant_id] || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3"><KeyTypeBadge type={k.key_type} /></td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{k.rate_limit_per_minute}/min</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                      <Activity className="h-3.5 w-3.5" /> {usage[k.id] || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge key_={k} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button title="Rotate key" onClick={() => rotate(k)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-white/10">
                        <RefreshCw className="h-4 w-4" />
                      </button>
                      {k.status === 'active' ? (
                        <button title="Revoke" onClick={() => revoke(k)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40">
                          <Ban className="h-4 w-4" />
                        </button>
                      ) : (
                        <button title="Reinstate" onClick={() => reinstate(k)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-950/40">
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button title="Delete" onClick={() => removeKey(k)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Issue modal ── */}
      {showIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setShowIssue(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Issue API Key</h2>
              <button onClick={() => setShowIssue(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Tenant data access *</label>
                <select value={form.tenant_id} onChange={(e) => setForm({ ...form, tenant_id: e.target.value })} className={input}>
                  <option value="">Select tenant…</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500">The key can only ever read/write this tenant's data.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Organisation *</label>
                  <input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })}
                    placeholder="e.g. Acme Logistics" className={input} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Label</label>
                  <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="e.g. Mobile app prod" className={input} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Contact name</label>
                  <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Contact email</label>
                  <input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className={input} />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Key type *</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setForm({ ...form, key_type: 'publishable', scopes: [...PUBLISHABLE_SCOPES] })}
                    className={`rounded-xl border-2 p-3 text-left ${form.key_type === 'publishable' ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <Globe className="mb-1 h-5 w-5 text-teal-500" />
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Publishable</p>
                    <p className="text-xs text-slate-500">Client-safe. Read-only catalogue endpoints.</p>
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, key_type: 'integration' })}
                    className={`rounded-xl border-2 p-3 text-left ${form.key_type === 'integration' ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <ShieldCheck className="mb-1 h-5 w-5 text-violet-500" />
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Integration</p>
                    <p className="text-xs text-slate-500">Server-side secret. Scoped read/write access.</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Scopes</label>
                {form.key_type === 'publishable' ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-white/5">
                    Publishable keys are fixed to read-only public scopes: {PUBLISHABLE_SCOPES.join(', ')}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {API_SCOPES.map((s) => (
                      <label key={s.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                        form.scopes.includes(s.id) ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700'
                      }`}>
                        <input type="checkbox" checked={form.scopes.includes(s.id)} onChange={() => toggleScope(s.id)} className="accent-indigo-600" />
                        <span className="text-slate-700 dark:text-slate-300">{s.label}</span>
                        {s.write && <span className="ml-auto rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">WRITE</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Rate limit / min</label>
                  <input type="number" min={1} max={10000} value={form.rate_limit_per_minute}
                    onChange={(e) => setForm({ ...form, rate_limit_per_minute: parseInt(e.target.value, 10) || 120 })} className={input} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Expires in (days)</label>
                  <input type="number" min={0} value={form.expires_in_days}
                    onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })} placeholder="Never" className={input} />
                </div>
              </div>

              {form.key_type === 'publishable' && (
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Allowed origins</label>
                  <input value={form.allowed_origins} onChange={(e) => setForm({ ...form, allowed_origins: e.target.value })}
                    placeholder="https://acme.app, https://www.acme.app" className={input} />
                  <p className="mt-1 text-xs text-slate-500">Comma-separated. Leave empty to allow any origin.</p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-500">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={input} />
              </div>

              <button onClick={issueKey} disabled={issuing}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                {issuing ? 'Issuing…' : 'Generate & Issue Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Newly generated key — shown exactly once ── */}
      {newKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Key issued for {newKey.row.organisation || 'developer'}</h2>
            </div>
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              Copy this key now. It is stored only as a hash — we can never show it again. If it is lost, rotate the key to issue a replacement.
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
              <code className="flex-1 break-all font-mono text-sm text-slate-900 dark:text-white">{newKey.rawKey}</code>
              <button onClick={copyKey} className="flex-shrink-0 rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <button onClick={() => setNewKey(null)}
              className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900">
              I've saved the key
            </button>
          </div>
        </div>
      )}

      {/* ── Key detail drawer ── */}
      {detailKey && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setDetailKey(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Key details</h2>
              <button onClick={() => setDetailKey(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <dl className="space-y-3 text-sm">
              {[
                ['Public ID', detailKey.public_id],
                ['Type', detailKey.key_type],
                ['Organisation', detailKey.organisation],
                ['Tenant', tenantName[detailKey.tenant_id]],
                ['Scopes', detailKey.scopes?.length ? detailKey.scopes.join(', ') : '—'],
                ['Rate limit', `${detailKey.rate_limit_per_minute} req/min`],
                ['Allowed origins', detailKey.allowed_origins?.length ? detailKey.allowed_origins.join(', ') : 'Any'],
                ['Expires', detailKey.expires_at ? new Date(detailKey.expires_at).toLocaleString() : 'Never'],
                ['Last used', detailKey.last_used_at ? new Date(detailKey.last_used_at).toLocaleString() : 'Never'],
                ['Issued', new Date(detailKey.created_at).toLocaleString()],
                ['Notes', detailKey.notes || '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-slate-100 pb-2 dark:border-white/5">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="break-all text-right font-medium text-slate-900 dark:text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 flex items-center gap-1 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" /> Requests in last 24h: {usage[detailKey.id] || 0}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
