import { useEffect, useState } from 'react'
import { Cpu, CheckCircle, XCircle, Clock, Banknote, Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

const PERIOD_MONTHS = { monthly: 1, quarterly: 3, halfyear: 6, yearly: 12 }
const PERIOD_LABEL = { monthly: 'Monthly', quarterly: '3 Months', halfyear: '6 Months', yearly: 'Yearly' }

export default function AdminFiscalRequests() {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignTenant, setAssignTenant] = useState('')
  const [assignPeriod, setAssignPeriod] = useState('monthly')
  const [working, setWorking] = useState(false)

  const load = async () => {
    const [{ data: reqs }, { data: tenantData }] = await Promise.all([
      supabase.from('fiscalisation_requests').select('*, tenants(name, slug, features)').order('created_at', { ascending: false }).limit(100),
      supabase.from('tenants').select('id, name, features').eq('status', 'active').order('name'),
    ])
    setRequests(reqs || [])
    setTenants(tenantData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const activateFiscal = async (tenantId, months, tenantName) => {
    const { data: t } = await supabase.from('tenants').select('features').eq('id', tenantId).single()
    const expires = new Date()
    expires.setMonth(expires.getMonth() + months)
    const { data: updated, error } = await supabase
      .from('tenants')
      .update({ features: { ...(t?.features || {}), fiscalisation: true }, fiscal_expires_at: expires.toISOString() })
      .eq('id', tenantId)
      .select('id')
    if (error || !updated?.length) throw new Error(error?.message || 'Update blocked')
    await supabase.from('audit_logs').insert({
      actor_id: user?.id,
      actor_email: user?.email,
      action: 'fiscalisation_activated',
      target_type: 'tenant',
      target_id: tenantId,
      details: { tenant_name: tenantName, months },
    })
  }

  const decide = async (req, approve) => {
    setWorking(true)
    try {
      if (approve) {
        await activateFiscal(req.tenant_id, PERIOD_MONTHS[req.period] || 1, req.tenants?.name)
      }
      await supabase
        .from('fiscalisation_requests')
        .update({ status: approve ? 'approved' : 'rejected', decided_at: new Date().toISOString(), decided_by: user?.id })
        .eq('id', req.id)
      toast.success(approve ? `Fiscalisation unlocked for ${req.tenants?.name}` : 'Request rejected')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setWorking(false)
    }
  }

  const manualAssign = async () => {
    if (!assignTenant) { toast.error('Select a business'); return }
    setWorking(true)
    try {
      const t = tenants.find((x) => x.id === assignTenant)
      await activateFiscal(assignTenant, PERIOD_MONTHS[assignPeriod], t?.name)
      toast.success(`Fiscalisation manually activated for ${t?.name}`)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setWorking(false)
    }
  }

  const suspendFiscal = async (tenantId, name) => {
    setWorking(true)
    try {
      const { data: t } = await supabase.from('tenants').select('features').eq('id', tenantId).single()
      await supabase
        .from('tenants')
        .update({ features: { ...(t?.features || {}), fiscalisation: false }, fiscal_expires_at: null })
        .eq('id', tenantId)
      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        actor_email: user?.email,
        action: 'fiscalisation_suspended',
        target_type: 'tenant',
        target_id: tenantId,
        details: { tenant_name: name },
      })
      toast.success(`Fiscalisation suspended for ${name}`)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setWorking(false)
    }
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const fiscalActive = tenants.filter((t) => t.features?.fiscalisation === true)

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Fiscalisation Requests</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cash payment approvals + manual activation of the ZIMRA add-on
        </p>
      </div>

      {/* Pending cash requests */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center gap-2">
          <Banknote className="h-5 w-5 text-amber-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">Pending Cash Requests ({pending.length})</h2>
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No pending requests — all caught up.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((req) => (
              <div key={req.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/40 dark:bg-amber-900/10">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{req.tenants?.name}</p>
                  <p className="text-xs text-slate-500">
                    {PERIOD_LABEL[req.period]} · ${Number(req.amount).toFixed(2)} cash ·
                    requested {new Date(req.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <button
                  onClick={() => decide(req, true)}
                  disabled={working}
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-60"
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  onClick={() => decide(req, false)}
                  disabled={working}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600/10 px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-600/20 disabled:opacity-60"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual assignment */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-5 w-5 text-indigo-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">Manual Activation (no request needed)</h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={assignTenant}
            onChange={(e) => setAssignTenant(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
          >
            <option value="">— Select business —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.features?.fiscalisation ? ' (already active)' : ''}
              </option>
            ))}
          </select>
          <select
            value={assignPeriod}
            onChange={(e) => setAssignPeriod(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none dark:border-white/10 dark:bg-slate-800 dark:text-white"
          >
            {Object.entries(PERIOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={manualAssign}
            disabled={working}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            Activate
          </button>
        </div>
      </div>

      {/* Active fiscal tenants */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center gap-2">
          <Cpu className="h-5 w-5 text-green-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">Active Fiscalisation ({fiscalActive.length})</h2>
        </div>
        {fiscalActive.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No tenants have the add-on active yet.</p>
        ) : (
          <div className="space-y-2">
            {fiscalActive.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-2.5 dark:border-white/5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{t.name}</span>
                <button
                  onClick={() => suspendFiscal(t.id, t.name)}
                  disabled={working}
                  className="rounded-lg bg-red-600/10 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-600/20 disabled:opacity-60"
                >
                  Suspend
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {requests.filter((r) => r.status !== 'pending').length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Request History</h2>
          </div>
          <div className="space-y-1.5">
            {requests.filter((r) => r.status !== 'pending').slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-xs text-slate-500">
                <span className={`rounded-full px-2 py-0.5 font-bold ${
                  r.status === 'approved' || r.status === 'paid'
                    ? 'bg-green-500/15 text-green-500'
                    : 'bg-red-500/15 text-red-500'
                }`}>{r.status}</span>
                <span className="min-w-0 flex-1 truncate">{r.tenants?.name} · {PERIOD_LABEL[r.period]} · ${Number(r.amount).toFixed(2)}</span>
                <span>{new Date(r.created_at).toLocaleDateString('en-GB')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
