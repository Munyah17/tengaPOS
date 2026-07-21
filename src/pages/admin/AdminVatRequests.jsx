import { useEffect, useState } from 'react'
import { Percent, CheckCircle, XCircle, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

export default function AdminVatRequests() {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState([])
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  const load = async () => {
    const [{ data: reqs }, { data: tenantData }] = await Promise.all([
      supabase.from('vat_requests').select('*, tenants(name, features)').order('created_at', { ascending: false }).limit(100),
      supabase.from('tenants').select('id, name, features').eq('status', 'active').order('name'),
    ])
    setRequests(reqs || [])
    setTenants(tenantData || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setVatUnlocked = async (tenantId, unlocked) => {
    const { data: t } = await supabase.from('tenants').select('features').eq('id', tenantId).single()
    const { error } = await supabase
      .from('tenants')
      .update({ features: { ...(t?.features || {}), vat: unlocked } })
      .eq('id', tenantId)
    if (error) throw error
  }

  const decide = async (req, approve) => {
    setWorking(true)
    try {
      if (approve) await setVatUnlocked(req.tenant_id, true)
      await supabase
        .from('vat_requests')
        .update({ status: approve ? 'approved' : 'rejected', decided_at: new Date().toISOString(), decided_by: user?.id })
        .eq('id', req.id)
      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        actor_email: user?.email,
        action: approve ? 'vat_approved' : 'vat_rejected',
        target_type: 'tenant',
        target_id: req.tenant_id,
        details: { tenant_name: req.tenants?.name, vat_number: req.vat_number },
      })
      toast.success(approve ? `VAT enabled for ${req.tenants?.name}` : 'Request rejected')
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setWorking(false)
    }
  }

  const revoke = async (tenantId, name) => {
    setWorking(true)
    try {
      await setVatUnlocked(tenantId, false)
      await supabase.from('audit_logs').insert({
        actor_id: user?.id,
        actor_email: user?.email,
        action: 'vat_revoked',
        target_type: 'tenant',
        target_id: tenantId,
        details: { tenant_name: name },
      })
      toast.success(`VAT access revoked for ${name}`)
      load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setWorking(false)
    }
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const vatActive = tenants.filter((t) => t.features?.vat === true)

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">VAT Requests</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Vendors must request VAT before they can charge it — verify their VAT registration, then approve.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">Pending Requests ({pending.length})</h2>
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
                    {req.vat_number ? `VAT No. ${req.vat_number}` : 'No VAT number given'}
                    {req.notes && ` · ${req.notes}`} · requested {new Date(req.created_at).toLocaleDateString('en-GB')}
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

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="mb-3 flex items-center gap-2">
          <Percent className="h-5 w-5 text-green-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">VAT Enabled ({vatActive.length})</h2>
        </div>
        {vatActive.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No tenants have VAT enabled yet.</p>
        ) : (
          <div className="space-y-2">
            {vatActive.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-2.5 dark:border-white/5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{t.name}</span>
                <button
                  onClick={() => revoke(t.id, t.name)}
                  disabled={working}
                  className="rounded-lg bg-red-600/10 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-600/20 disabled:opacity-60"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {requests.filter((r) => r.status !== 'pending').length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Request History</h2>
          </div>
          <div className="space-y-1.5">
            {requests.filter((r) => r.status !== 'pending').slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-xs text-slate-500">
                <span className={`rounded-full px-2 py-0.5 font-bold ${r.status === 'approved' ? 'bg-green-500/15 text-green-500' : 'bg-red-500/15 text-red-500'}`}>{r.status}</span>
                <span className="min-w-0 flex-1 truncate">{r.tenants?.name}</span>
                <span>{new Date(r.created_at).toLocaleDateString('en-GB')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
