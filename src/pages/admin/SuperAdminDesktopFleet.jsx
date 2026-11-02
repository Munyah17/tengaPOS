import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Monitor, RefreshCw, ShieldAlert, Ban, Trash2, PauseCircle, Eye,
  AlertTriangle, FileText, Plus, Copy, Check, Scale, Download,
  KeyRound, X, Package, Upload, Store,
} from 'lucide-react'
import Modal from '@/components/common/Modal'
import {
  adminListDevices, adminGetDevice, adminSuspendDevice, adminRevokeDevice,
  adminDeleteDevice, adminListEvents, adminGetStats, adminListDownloads,
  adminListInfringements, adminCreateInfringement, adminPatchInfringement,
  adminIssueLicense, adminListLicenses, adminMarkPurchasePaid,
  listReleases, uploadInstaller, createRelease, patchRelease,
  adminListDistributors, adminCreateDistributor, adminPatchDistributor,
  adminListDistributorDevices, adminCreateVolumeLicense,
} from '@/lib/desktopLicense'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

const TABS = [
  { key: 'fleet', label: 'Fleet', icon: Monitor },
  { key: 'licenses', label: 'Licenses', icon: KeyRound },
  { key: 'events', label: 'Security Events', icon: ShieldAlert },
  { key: 'piracy', label: 'Piracy Cases', icon: Scale },
  { key: 'releases', label: 'Releases', icon: Package },
]

const PURCHASE_STYLES = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  refunded: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const STATUS_STYLES = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  revoked: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  deleted: 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const EVENT_STYLES = {
  activation_failed: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',
  signature_fail: 'text-red-600 bg-red-50 dark:bg-red-900/30',
  device_cloned: 'text-red-600 bg-red-50 dark:bg-red-900/30',
  unauthorized_build: 'text-red-600 bg-red-50 dark:bg-red-900/30',
  update_probe_denied: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',
  device_revoked: 'text-red-600 bg-red-50 dark:bg-red-900/30',
  device_suspended: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',
  device_reinstated: 'text-green-600 bg-green-50 dark:bg-green-900/30',
  device_deleted: 'text-slate-600 bg-slate-100 dark:bg-slate-800',
  license_issued: 'text-brand-600 bg-brand-50 dark:bg-brand-900/30',
  manual_report: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30',
}

const CASE_STYLES = {
  detected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  notice_sent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  settled: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  escalated: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
  closed: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}
function money(n) {
  return n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}
function flagBadges(flags) {
  if (!flags || Object.keys(flags).length === 0) return null
  return Object.keys(flags).map((f) => (
    <span key={f} className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:bg-red-900/40 dark:text-red-400">
      {f}
    </span>
  ))
}

export default function SuperAdminDesktopFleet() {
  const [tab, setTab] = useState('fleet')
  const [stats, setStats] = useState(null)
  const [devices, setDevices] = useState([])
  const [licenses, setLicenses] = useState({ purchases: [], codes: [] })
  const [events, setEvents] = useState([])
  const [cases, setCases] = useState([])
  const [downloads, setDownloads] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState('')
  const [detail, setDetail] = useState(null) // { device, checkins, events }
  const [confirm, setConfirm] = useState(null) // { action, device }
  const [issueModal, setIssueModal] = useState(false)
  const [issueForm, setIssueForm] = useState({ tenant_id: '', device_label: '', ttl_minutes: 1440 })
  const [tenants, setTenants] = useState([])
  const [newCode, setNewCode] = useState(null)
  const [copied, setCopied] = useState(false)
  const [caseModal, setCaseModal] = useState(null) // 'new' | case object
  const [caseForm, setCaseForm] = useState({})
  const [releases, setReleases] = useState([])
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishFile, setPublishFile] = useState(null)
  const [publishForm, setPublishForm] = useState({ version: '', channel: 'stable', rollout_pct: 100, release_notes_url: '' })
  const [distributors, setDistributors] = useState([])
  const [dealerModal, setDealerModal] = useState(null) // 'new' | distributor object
  const [dealerForm, setDealerForm] = useState({})
  const [volModal, setVolModal] = useState(null) // distributor object the license is for
  const [volForm, setVolForm] = useState({ tenant_id: '', max_devices: 10, valid_until: '', label: '' })
  const [expandedDealer, setExpandedDealer] = useState(null)
  const [dealerDevices, setDealerDevices] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, d, e, c, dl, li, rel, distr] = await Promise.allSettled([
        adminGetStats(),
        adminListDevices(statusFilter ? { status: statusFilter } : {}),
        adminListEvents(eventTypeFilter ? { type: eventTypeFilter } : {}),
        adminListInfringements(),
        adminListDownloads(),
        adminListLicenses(),
        listReleases(),
        adminListDistributors(),
      ])
      if (s.status === 'fulfilled') setStats(s.value)
      if (d.status === 'fulfilled') setDevices(d.value.devices || [])
      if (li.status === 'fulfilled') setLicenses(li.value)
      if (e.status === 'fulfilled') setEvents(e.value.events || [])
      if (c.status === 'fulfilled') setCases(c.value.cases || [])
      if (dl.status === 'fulfilled') setDownloads(dl.value.downloads || [])
      if (rel.status === 'fulfilled') setReleases(rel.value.releases || [])
      if (distr.status === 'fulfilled') setDistributors(distr.value.distributors || [])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, eventTypeFilter])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  // Load tenant list once for the staff-issue dropdown
  useEffect(() => {
    if ((!issueModal && !volModal) || tenants.length) return
    supabase.from('tenants').select('id, name').eq('status', 'active').order('name').limit(500)
      .then(({ data }) => setTenants(data || []))
  }, [issueModal, volModal, tenants.length])

  const openDetail = async (device) => {
    try { setDetail(await adminGetDevice(device.id)) }
    catch (err) { toast.error(err.message) }
  }

  const runAction = async () => {
    const { action, device } = confirm
    try {
      if (action === 'suspend') await adminSuspendDevice(device.id, 'admin_suspend')
      if (action === 'revoke') await adminRevokeDevice(device.id, 'admin_revoke')
      if (action === 'delete') await adminDeleteDevice(device.id)
      toast.success(`Device ${action === 'delete' ? 'deleted' : action + 'ed'}`)
      setConfirm(null)
      setDetail(null)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const markPaid = async (purchaseId) => {
    try {
      await adminMarkPurchasePaid(purchaseId)
      toast.success('Marked paid — the linked code now activates')
      load()
    } catch (err) { toast.error(err.message) }
  }

  const publishRelease = async (e) => {
    e.preventDefault()
    if (!publishFile) { toast.error('Choose the installer .exe first'); return }
    if (!publishForm.version.trim()) { toast.error('Version is required'); return }
    setPublishing(true)
    try {
      const artifact = await uploadInstaller(publishFile, publishForm.version.trim())
      await createRelease({
        version: publishForm.version.trim(),
        channel: publishForm.channel,
        rollout_pct: Number(publishForm.rollout_pct) || 100,
        release_notes_url: publishForm.release_notes_url.trim() || null,
        artifacts: [artifact],
      })
      toast.success(`v${publishForm.version.trim()} published to ${publishForm.channel}`)
      setPublishOpen(false)
      setPublishFile(null)
      load()
    } catch (err) { toast.error(err.message) } finally { setPublishing(false) }
  }

  const toggleWithdraw = async (release) => {
    try {
      await patchRelease(release.id, { withdraw: !release.withdrawn_at })
      toast.success(release.withdrawn_at ? `v${release.version} reinstated` : `v${release.version} withdrawn`)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const saveDealer = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        name: dealerForm.name,
        contact_email: dealerForm.contact_email || null,
        contact_phone: dealerForm.contact_phone || null,
        seat_price_usd: Number(dealerForm.seat_price_usd) || 150,
        notes: dealerForm.notes || null,
      }
      if (dealerModal === 'new') {
        await adminCreateDistributor(payload)
        toast.success(`Dealer "${payload.name}" created`)
      } else {
        await adminPatchDistributor(dealerModal.id, { ...payload, is_active: dealerForm.is_active })
        toast.success('Dealer updated')
      }
      setDealerModal(null)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const issueVolumeLicense = async (e) => {
    e.preventDefault()
    try {
      const res = await adminCreateVolumeLicense({
        distributor_id: volModal.id,
        tenant_id: volForm.tenant_id,
        max_devices: Number(volForm.max_devices),
        valid_until: volForm.valid_until,
        label: volForm.label,
      })
      setNewCode(res)
      setVolModal(null)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const toggleDealerDevices = async (dist) => {
    if (expandedDealer === dist.id) { setExpandedDealer(null); return }
    setExpandedDealer(dist.id)
    setDealerDevices([])
    try { setDealerDevices((await adminListDistributorDevices(dist.id)).devices || []) }
    catch (err) { toast.error(err.message) }
  }

  const issueCode = async (e) => {
    e.preventDefault()
    try {
      const res = await adminIssueLicense({
        tenantId: issueForm.tenant_id,
        deviceLabel: issueForm.device_label,
        ttlMinutes: Number(issueForm.ttl_minutes),
      })
      setNewCode(res)
      setIssueModal(false)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const saveCase = async (e) => {
    e.preventDefault()
    try {
      if (caseModal === 'new') {
        await adminCreateInfringement({
          source: 'manual',
          device_id: caseForm.device_id || null,
          tenant_id: caseForm.tenant_id || null,
          ip: caseForm.ip || null,
          fingerprint: caseForm.fingerprint || null,
          description: caseForm.description || '',
          plan_rate: caseForm.plan_rate ? Number(caseForm.plan_rate) : null,
          months_observed: caseForm.months_observed ? Number(caseForm.months_observed) : null,
          seats: Number(caseForm.seats) || 1,
          notes: caseForm.notes || null,
        })
        toast.success('Case opened')
      } else {
        const patch = {}
        for (const k of ['status', 'description', 'plan_rate', 'months_observed', 'seats', 'notes', 'notice_recipient', 'notice_channel']) {
          if (caseForm[k] !== undefined) patch[k] = caseForm[k]
        }
        await adminPatchInfringement(caseModal.id, patch)
        toast.success('Case updated')
      }
      setCaseModal(null)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const openCaseEdit = (c) => {
    setCaseForm({
      status: c.status, description: c.description, plan_rate: c.plan_rate,
      months_observed: c.months_observed, seats: c.seats, notes: c.notes,
      notice_recipient: c.notice_recipient, notice_channel: c.notice_channel,
      device_id: c.device_id, tenant_id: c.tenant_id, ip: c.ip, fingerprint: c.fingerprint,
    })
    setCaseModal(c)
  }

  const totalDamages = useMemo(
    () => cases.reduce((s, c) => s + (Number(c.estimated_damages) || 0), 0),
    [cases],
  )

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Desktop Fleet</h1>
          <p className="text-sm text-slate-500">
            Terminals, security monitoring & piracy enforcement across all businesses
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => { setIssueForm({ tenant_id: '', device_label: '', ttl_minutes: 1440 }); setIssueModal(true) }}
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700">
            <KeyRound className="h-4 w-4" /> Issue License
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
          {[
            { label: 'Total Terminals', value: stats.total_devices, icon: Monitor, color: 'brand' },
            { label: 'Active', value: stats.by_status?.active || 0, icon: Check, color: 'green' },
            { label: 'Flagged', value: stats.flagged_devices, icon: AlertTriangle, color: 'red' },
            { label: 'Dark >7d', value: stats.dark_devices, icon: Eye, color: 'purple' },
            { label: 'Downloads', value: stats.total_downloads, icon: Download, color: 'slate' },
            { label: 'Open Cases', value: stats.open_infringement_cases, icon: Scale, color: 'amber' },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <k.icon className={`mb-1.5 h-5 w-5 ${k.color === 'red' ? 'text-red-500' : k.color === 'green' ? 'text-green-500' : k.color === 'purple' ? 'text-purple-500' : k.color === 'amber' ? 'text-amber-500' : 'text-brand-500'}`} />
              <div className="text-xl font-extrabold text-slate-900 dark:text-white">{k.value}</div>
              <div className="text-xs text-slate-500">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === t.key ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ─── FLEET ─── */}
      {tab === 'fleet' && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-bold text-slate-900 dark:text-white">Activated Terminals</h2>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="revoked">Revoked</option>
              <option value="deleted">Deleted</option>
            </select>
          </div>
          {devices.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-slate-500">No terminals{statusFilter ? ` with status "${statusFilter}"` : ''}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {devices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <div className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800">
                    <Monitor className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{d.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[d.status]}`}>{d.status}</span>
                      {d.desktop_distributors?.name && (
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          {d.desktop_distributors.name}
                        </span>
                      )}
                      {flagBadges(d.flags)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                      <span className="font-semibold text-slate-600 dark:text-slate-400">{d.tenants?.name || '—'}</span>
                      <span>{d.app_version ? `v${d.app_version}` : 'no version'} · {d.os || '—'}</span>
                      {d.last_ip && <span className="font-mono">{d.last_ip}</span>}
                      <span>check-in {fmt(d.last_checkin_at)}</span>
                      <span>lease → {fmt(d.lease_expires_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openDetail(d)} title="Detail" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {d.status === 'active' && (
                      <button onClick={() => setConfirm({ action: 'suspend', device: d })} title="Suspend"
                        className="rounded-lg border border-amber-200 p-2 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30">
                        <PauseCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(d.status === 'active' || d.status === 'suspended') && (
                      <button onClick={() => setConfirm({ action: 'revoke', device: d })} title="Revoke"
                        className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {d.status !== 'deleted' && (
                      <button onClick={() => setConfirm({ action: 'delete', device: d })} title="Delete"
                        className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ─── LICENSES ─── */}
      {tab === 'licenses' && (
        <div className="space-y-4">
          {/* Distributors / volume licenses */}
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Distributors</h2>
                <p className="text-xs text-slate-500">Dealers with volume licenses — custom seat price, device cap and licence period</p>
              </div>
              <button onClick={() => { setDealerForm({ name: '', seat_price_usd: 150, contact_email: '', contact_phone: '', notes: '' }); setDealerModal('new') }}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700">
                <Plus className="h-4 w-4" /> Add Dealer
              </button>
            </div>
            {distributors.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">No distributors yet — add a dealer to issue volume licenses</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {distributors.map((dist) => {
                  const codes = dist.desktop_activation_codes || []
                  const seatsTotal = codes.reduce((n, c) => n + (c.max_uses || 0), 0)
                  const seatsUsed = codes.reduce((n, c) => n + (c.uses || 0), 0)
                  const liveDevices = devices.filter((dv) => dv.distributor_id === dist.id && dv.status === 'active').length
                  return (
                    <li key={dist.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800">
                          <Store className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">{dist.name}</span>
                            {!dist.is_active && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:bg-red-900/40 dark:text-red-400">inactive</span>}
                            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">${Number(dist.seat_price_usd).toFixed(0)}/seat</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                            <span className="font-semibold">{seatsUsed}/{seatsTotal} seats redeemed · {liveDevices} active terminals</span>
                            {dist.contact_email && <span>{dist.contact_email}</span>}
                            {dist.contact_phone && <span>{dist.contact_phone}</span>}
                          </div>
                        </div>
                        <button onClick={() => { setVolForm({ tenant_id: '', max_devices: 10, valid_until: '', label: '' }); setVolModal(dist) }}
                          className="rounded-xl border border-brand-200 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-400 dark:hover:bg-brand-950/30">
                          Issue License
                        </button>
                        <button onClick={() => { setDealerForm({ ...dist }); setDealerModal(dist) }}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => toggleDealerDevices(dist)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Per-license seat usage */}
                      {codes.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          {codes.map((c) => (
                            <div key={c.id} className="flex items-center gap-3 text-xs">
                              <span className="w-24 shrink-0 font-mono text-slate-400">TGA-••••-{c.code_hint}</span>
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div className={`h-full rounded-full ${c.uses >= c.max_uses ? 'bg-red-500' : 'bg-brand-500'}`}
                                  style={{ width: `${Math.min(100, (c.uses / c.max_uses) * 100)}%` }} />
                              </div>
                              <span className="w-14 shrink-0 font-semibold text-slate-600 dark:text-slate-300">{c.uses}/{c.max_uses}</span>
                              <span className="shrink-0 text-slate-400">{c.tenants?.name} · until {c.valid_until ? new Date(c.valid_until).toLocaleDateString() : '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Expanded: dealer terminals */}
                      {expandedDealer === dist.id && (
                        <div className="mt-3 rounded-xl border border-slate-100 dark:border-slate-800">
                          {dealerDevices.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-slate-400">No terminals activated under this dealer</p>
                          ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                              {dealerDevices.map((dv) => (
                                <li key={dv.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs text-slate-500">
                                  <Monitor className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="font-bold text-slate-700 dark:text-slate-300">{dv.name}</span>
                                  <span>{dv.tenants?.name}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[dv.status] || 'bg-slate-100 text-slate-500'}`}>{dv.status}</span>
                                  <span className="ml-auto">check-in {fmt(dv.last_checkin_at)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h2 className="font-bold text-slate-900 dark:text-white">License Purchases</h2>
              <p className="text-xs text-slate-500">Once-off $150 licenses — staff-issued and self-purchased in one feed</p>
            </div>
            {licenses.purchases.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">No purchases yet</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {licenses.purchases.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                    <KeyRound className="h-4 w-4 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{p.tenants?.name || '—'}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PURCHASE_STYLES[p.status]}`}>{p.status}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                          {p.source === 'staff' ? 'staff-issued' : 'self-purchase'}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                        <span>${Number(p.amount).toFixed(2)} {p.currency}</span>
                        {p.desktop_activation_codes?.code_hint && <span className="font-mono">TGA-••••-{p.desktop_activation_codes.code_hint}</span>}
                        <span>{fmt(p.created_at)}</span>
                        {p.paid_at && <span>paid {fmt(p.paid_at)}</span>}
                        {p.payment_ref && <span>ref {p.payment_ref}</span>}
                      </div>
                    </div>
                    {p.status === 'pending' && (
                      <button onClick={() => markPaid(p.id)}
                        className="rounded-xl bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700">
                        Mark Paid
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h2 className="font-bold text-slate-900 dark:text-white">All Activation Codes</h2>
            </div>
            {licenses.codes.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">No codes issued yet</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {licenses.codes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-2.5 text-xs">
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">TGA-••••-{c.code_hint}</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-400">{c.tenants?.name || '—'}</span>
                    {c.desktop_distributors?.name && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                        {c.desktop_distributors.name} · {c.uses}/{c.max_uses}
                      </span>
                    )}
                    <span className="text-slate-500">{c.label}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[c.status] || 'bg-slate-100 text-slate-500'}`}>{c.status}</span>
                    <span className="text-slate-400">{fmt(c.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ─── EVENTS ─── */}
      {tab === 'events' && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-bold text-slate-900 dark:text-white">Security Events</h2>
            <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">All types</option>
              {Object.keys(EVENT_STYLES).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="mb-0 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            Detection only reaches installs that contact the API — a crack that never
            phones home is invisible until reported manually.
          </div>
          {events.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-slate-500">No events</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${EVENT_STYLES[e.type] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {e.type}
                  </span>
                  <div className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {e.desktop_devices?.name || e.detail?.claimed_device_id || e.detail?.code_hint || '—'}
                    </span>
                    {e.tenants?.name && <span> · {e.tenants.name}</span>}
                    {e.ip && <span className="font-mono"> · {e.ip}</span>}
                    {e.detail && Object.keys(e.detail).length > 0 && (
                      <span className="text-slate-400"> · {JSON.stringify(e.detail)}</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{fmt(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ─── PIRACY ─── */}
      {tab === 'piracy' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/30">
              <div className="text-xs font-semibold text-red-600 dark:text-red-400">Estimated damages across all cases</div>
              <div className="text-2xl font-extrabold text-red-700 dark:text-red-300">{money(totalDamages)}</div>
            </div>
            <button onClick={() => { setCaseForm({ source: 'manual', seats: 1 }); setCaseModal('new') }}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">
              <Plus className="h-4 w-4" /> New Case
            </button>
          </div>

          {cases.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-700">
              <Scale className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-medium text-slate-500">No infringement cases</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cases.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="rounded-xl bg-red-100 p-2.5 dark:bg-red-900/40">
                    <Scale className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {c.desktop_devices?.name || c.tenants?.name || c.ip || c.fingerprint || 'Unknown subject'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CASE_STYLES[c.status]}`}>
                        {c.status.replace('_', ' ')}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                        {c.source.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                      {c.description && <span className="max-w-md truncate">{c.description}</span>}
                      <span>{c.seats} seat{c.seats !== 1 ? 's' : ''} · {c.months_observed ?? '?'} mo · {money(c.plan_rate)}/mo</span>
                      {c.notice_sent_at && <span>Notice sent {fmt(c.notice_sent_at)} via {c.notice_channel || '—'}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-extrabold text-red-600 dark:text-red-400">{money(c.estimated_damages)}</div>
                    <button onClick={() => openCaseEdit(c)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                      <FileText className="h-3 w-3" /> Manage
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {downloads.length > 0 && (
            <details className="mt-6 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-slate-900 dark:text-white">
                Download log ({downloads.length})
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {downloads.slice(0, 50).map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-xs text-slate-500">
                    <Download className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">v{d.version}</span>
                    <span>{d.os} · {d.channel}</span>
                    {d.ip && <span className="font-mono">{d.ip}</span>}
                    <span className="ml-auto">{fmt(d.created_at)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ─── RELEASES ─── */}
      {tab === 'releases' && (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-bold text-slate-900 dark:text-white">Published Releases</h2>
            <button onClick={() => { setPublishForm({ version: '', channel: 'stable', rollout_pct: 100, release_notes_url: '' }); setPublishFile(null); setPublishOpen(true) }}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700">
              <Upload className="h-4 w-4" /> Publish Release
            </button>
          </div>
          {releases.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-slate-500">No releases published yet</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {releases.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                  <div className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800">
                    <Package className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">v{r.version}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${r.channel === 'stable' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>{r.channel}</span>
                      {r.withdrawn_at && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700 dark:bg-red-900/40 dark:text-red-400">withdrawn</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-slate-500">
                      <span>rollout {r.rollout_pct}%</span>
                      <span>{(r.desktop_release_artifacts || []).map((a) => `${a.os} · ${(a.size_bytes / 1048576).toFixed(1)}MB`).join(', ') || 'no artifacts'}</span>
                      <span>{fmt(r.published_at)}</span>
                    </div>
                  </div>
                  <button onClick={() => toggleWithdraw(r)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${r.withdrawn_at ? 'border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400' : 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400'}`}>
                    {r.withdrawn_at ? 'Reinstate' : 'Withdraw'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Publish release modal */}
      <Modal isOpen={publishOpen} onClose={() => setPublishOpen(false)} title="Publish Desktop Release">
        <form onSubmit={publishRelease} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Installer (.exe)</label>
            <input type="file" accept=".exe" required onChange={(e) => setPublishFile(e.target.files?.[0] || null)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            {publishFile && <p className="mt-1 text-xs text-slate-500">{publishFile.name} · {(publishFile.size / 1048576).toFixed(1)} MB — uploads to the private desktop-releases bucket</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Version</label>
              <input value={publishForm.version} onChange={(e) => setPublishForm({ ...publishForm, version: e.target.value })} required placeholder="1.0.0"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Channel</label>
              <select value={publishForm.channel} onChange={(e) => setPublishForm({ ...publishForm, channel: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="stable">stable</option>
                <option value="beta">beta</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Rollout %</label>
              <input type="number" min="1" max="100" value={publishForm.rollout_pct} onChange={(e) => setPublishForm({ ...publishForm, rollout_pct: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Notes URL (optional)</label>
              <input type="url" value={publishForm.release_notes_url} onChange={(e) => setPublishForm({ ...publishForm, release_notes_url: e.target.value })} placeholder="https://…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <button type="submit" disabled={publishing}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-700">
            {publishing ? 'Uploading & registering…' : 'Publish'}
          </button>
        </form>
      </Modal>

      {/* Dealer create/edit */}
      <Modal isOpen={!!dealerModal} onClose={() => setDealerModal(null)} title={dealerModal === 'new' ? 'New Distributor' : `Dealer — ${dealerModal?.name}`}>
        <form onSubmit={saveDealer} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Dealer name *</label>
            <input required value={dealerForm.name || ''} onChange={(e) => setDealerForm({ ...dealerForm, name: e.target.value })}
              placeholder="e.g. Harare Tech Resellers"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Seat price (USD) *</label>
              <input type="number" min="0" step="0.01" required value={dealerForm.seat_price_usd ?? 150}
                onChange={(e) => setDealerForm({ ...dealerForm, seat_price_usd: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Contact phone</label>
              <input value={dealerForm.contact_phone || ''} onChange={(e) => setDealerForm({ ...dealerForm, contact_phone: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Contact email</label>
            <input type="email" value={dealerForm.contact_email || ''} onChange={(e) => setDealerForm({ ...dealerForm, contact_email: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Notes</label>
            <input value={dealerForm.notes || ''} onChange={(e) => setDealerForm({ ...dealerForm, notes: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          {dealerModal !== 'new' && (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={dealerForm.is_active !== false}
                onChange={(e) => setDealerForm({ ...dealerForm, is_active: e.target.checked })} />
              Active — inactive dealers cannot receive new licenses
            </label>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={() => setDealerModal(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">Cancel</button>
            <button type="submit" className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
              {dealerModal === 'new' ? 'Create Dealer' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Issue volume license */}
      <Modal isOpen={!!volModal} onClose={() => setVolModal(null)} title={`Volume License — ${volModal?.name || ''}`}>
        <form onSubmit={issueVolumeLicense} className="space-y-4">
          <p className="rounded-xl bg-brand-50 px-4 py-3 text-xs text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">
            One shared activation code for <strong>{volModal?.name}</strong> — every terminal that redeems it counts against the seat cap below. Dealer rate: ${Number(volModal?.seat_price_usd || 0).toFixed(0)}/seat.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Customer (tenant) *</label>
            <select required value={volForm.tenant_id} onChange={(e) => setVolForm({ ...volForm, tenant_id: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">Select tenant…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Max devices *</label>
              <input type="number" min="1" max="10000" required value={volForm.max_devices}
                onChange={(e) => setVolForm({ ...volForm, max_devices: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              {volModal && <p className="mt-1 text-xs text-slate-400">Value: ${(Number(volForm.max_devices || 0) * Number(volModal.seat_price_usd || 0)).toFixed(2)}</p>}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">License valid until *</label>
              <input type="date" required value={volForm.valid_until}
                onChange={(e) => setVolForm({ ...volForm, valid_until: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Label</label>
            <input value={volForm.label} onChange={(e) => setVolForm({ ...volForm, label: e.target.value })}
              placeholder="e.g. 50-seat 2026 bundle"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setVolModal(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">Cancel</button>
            <button type="submit" className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Issue License</button>
          </div>
        </form>
      </Modal>

      {/* Device detail modal */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail?.device?.name || 'Device'}>
        {detail && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ['Tenant', detail.device.tenants?.name],
                ['Status', detail.device.status],
                ['Version', detail.device.app_version ? `v${detail.device.app_version}` : '—'],
                ['OS', detail.device.os],
                ['Last IP', detail.device.last_ip],
                ['Fingerprint', detail.device.public_key_fingerprint],
                ['Activated', fmt(detail.device.activated_at)],
                ['Last check-in', fmt(detail.device.last_checkin_at)],
                ['Lease expires', fmt(detail.device.lease_expires_at)],
                ['Grace until', fmt(detail.device.grace_until)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="font-mono text-xs text-slate-700 dark:text-slate-300">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            {flagBadges(detail.device.flags)}
            {detail.events?.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Events</h4>
                <ul className="max-h-40 space-y-1 overflow-y-auto">
                  {detail.events.map((e) => (
                    <li key={e.id} className="text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-bold">{e.type}</span> · {fmt(e.created_at)} {e.ip && `· ${e.ip}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail.checkins?.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase text-slate-500">Recent check-ins</h4>
                <ul className="max-h-32 space-y-1 overflow-y-auto">
                  {detail.checkins.slice(0, 10).map((c) => (
                    <li key={c.checkin_id} className="text-xs text-slate-600 dark:text-slate-400">
                      {fmt(c.created_at)} {c.app_version && `· v${c.app_version}`} {c.ip && `· ${c.ip}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Action confirm */}
      <Modal isOpen={!!confirm} onClose={() => setConfirm(null)} title={confirm ? `${confirm.action[0].toUpperCase() + confirm.action.slice(1)} "${confirm.device.name}"?` : ''}>
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              {confirm.action === 'suspend' && 'Suspended devices verify fine at check-in but get no lease renewal — the terminal stops selling at its current grace boundary. Reversible.'}
              {confirm.action === 'revoke' && 'The terminal is told to stop selling at its next check-in. A device that never reconnects keeps running until its lease expires — revocation can\u2019t reach a permanently offline machine.'}
              {confirm.action === 'delete' && 'Removes the terminal and its license record permanently. The device will be treated as revoked on any future contact.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">Cancel</button>
              <button onClick={runAction} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700">
                Confirm {confirm.action}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Staff-issue license */}
      <Modal isOpen={issueModal} onClose={() => setIssueModal(false)} title="Issue Activation Code (staff)">
        <form onSubmit={issueCode} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Business *</label>
            <select required value={issueForm.tenant_id} onChange={(e) => setIssueForm({ ...issueForm, tenant_id: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">Select tenant…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Device label</label>
            <input value={issueForm.device_label} onChange={(e) => setIssueForm({ ...issueForm, device_label: e.target.value })}
              placeholder="e.g. Back-office PC"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Valid for (minutes)</label>
            <input type="number" min="15" max="10080" value={issueForm.ttl_minutes}
              onChange={(e) => setIssueForm({ ...issueForm, ttl_minutes: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <p className="mt-1 text-xs text-slate-400">Default 1440 (24 h) for remote delivery; max 7 days.</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setIssueModal(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">Cancel</button>
            <button type="submit" className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Issue Code</button>
          </div>
        </form>
      </Modal>

      {/* Issued code reveal */}
      <Modal isOpen={!!newCode} onClose={() => setNewCode(null)} title="Activation Code">
        {newCode && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 rounded-2xl bg-slate-100 py-6 dark:bg-slate-800">
              <span className="font-mono text-2xl font-extrabold tracking-widest text-slate-900 dark:text-white">{newCode.code}</span>
              <button onClick={async () => { await navigator.clipboard.writeText(newCode.code); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                className="rounded-lg p-2 text-slate-500 hover:bg-white dark:hover:bg-slate-700">
                {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
            <p className="text-center text-xs text-slate-500">Valid until {fmt(newCode.expires_at)} — share over a secure channel.</p>
            <button onClick={() => setNewCode(null)} className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Done</button>
          </div>
        )}
      </Modal>

      {/* Infringement case editor */}
      <Modal isOpen={!!caseModal} onClose={() => setCaseModal(null)} title={caseModal === 'new' ? 'New Infringement Case' : `Case — ${caseModal?.status}`}>
        <form onSubmit={saveCase} className="space-y-3">
          {caseModal !== 'new' && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Status</label>
              <select value={caseForm.status} onChange={(e) => setCaseForm({ ...caseForm, status: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                {Object.keys(CASE_STYLES).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Description</label>
            <textarea rows={2} value={caseForm.description || ''} onChange={(e) => setCaseForm({ ...caseForm, description: e.target.value })}
              placeholder="e.g. Cracked build v1.4.0 found on torrent site, bundled with license file"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Linked device ID</label>
              <input value={caseForm.device_id || ''} onChange={(e) => setCaseForm({ ...caseForm, device_id: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Suspect IP</label>
              <input value={caseForm.ip || ''} onChange={(e) => setCaseForm({ ...caseForm, ip: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Plan rate $/mo</label>
              <input type="number" step="0.01" value={caseForm.plan_rate ?? ''} onChange={(e) => setCaseForm({ ...caseForm, plan_rate: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Months</label>
              <input type="number" step="0.5" value={caseForm.months_observed ?? ''} onChange={(e) => setCaseForm({ ...caseForm, months_observed: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Seats</label>
              <input type="number" min="1" value={caseForm.seats ?? 1} onChange={(e) => setCaseForm({ ...caseForm, seats: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          {caseModal !== 'new' && (
            <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-900/20">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300">Estimated damages</span>
                <span className="text-lg font-extrabold text-red-600 dark:text-red-400">
                  {money((Number(caseForm.plan_rate) || 0) * (Number(caseForm.months_observed) || 0) * (Number(caseForm.seats) || 1))}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={caseForm.notice_recipient || ''} onChange={(e) => setCaseForm({ ...caseForm, notice_recipient: e.target.value })}
                  placeholder="Notice sent to (name/email)"
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs dark:border-amber-800 dark:bg-slate-800 dark:text-white" />
                <select value={caseForm.notice_channel || ''} onChange={(e) => setCaseForm({ ...caseForm, notice_channel: e.target.value })}
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs dark:border-amber-800 dark:bg-slate-800 dark:text-white">
                  <option value="">Channel…</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="courier">Courier</option>
                  <option value="lawyer">Lawyer</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Notes</label>
            <textarea rows={2} value={caseForm.notes || ''} onChange={(e) => setCaseForm({ ...caseForm, notes: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={() => setCaseModal(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">
              <X className="mr-1 inline h-4 w-4" /> Cancel
            </button>
            <button type="submit" className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700">
              {caseModal === 'new' ? 'Open Case' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
