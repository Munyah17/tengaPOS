import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Monitor, Download, KeyRound, Plus, Copy, Check, RefreshCw,
  Ban, RotateCcw, Wifi, WifiOff, Clock, Laptop, ShoppingCart,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import Modal from '@/components/common/Modal'
import {
  getDownloadInfo, createActivationCode, listActivationCodes,
  revokeActivationCode, listDevices, revokeDevice, unrevokeDevice,
  purchaseLicense, listLicenses, linkPurchasePayment, purchaseStripeCheckout,
} from '@/lib/desktopLicense'
import { initiatePaynowCheckout } from '@/lib/paynow'
import toast from 'react-hot-toast'

// Issuing activation codes / revoking terminals is owner-level licensing
// — same restriction as payments & fiscalisation.
const CAN_MANAGE = ['vendor']

const PURCHASE_STYLES = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  refunded: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
  consumed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  expired: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  revoked: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
}

function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function DesktopApp() {
  const { role, tenant } = useAuthStore()
  const canManage = CAN_MANAGE.includes(role)

  const [loading, setLoading] = useState(true)
  const [codes, setCodes] = useState([])
  const [purchases, setPurchases] = useState([])
  const [devices, setDevices] = useState([])
  const [download, setDownload] = useState(null)
  const [newCode, setNewCode] = useState(null)      // { code, expires_at } — shown once
  const [showIssue, setShowIssue] = useState(false)
  const [label, setLabel] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [buyOpen, setBuyOpen] = useState(false)
  const [buyLabel, setBuyLabel] = useState('')
  const [buying, setBuying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState(null)    // device object pending confirm

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, d, dl, lic] = await Promise.allSettled([
        listActivationCodes(), listDevices(), getDownloadInfo(), listLicenses(),
      ])
      if (c.status === 'fulfilled') setCodes(c.value.codes || [])
      if (lic.status === 'fulfilled') setPurchases(lic.value.purchases || [])
      if (d.status === 'fulfilled') setDevices(d.value.devices || [])
      if (dl.status === 'fulfilled') setDownload(dl.value)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  const issue = async (e) => {
    e.preventDefault()
    setIssuing(true)
    try {
      const res = await createActivationCode({ device_label: label.trim() })
      setNewCode(res)
      setShowIssue(false)
      setLabel('')
      load()
    } catch (err) {
      toast.error(err.message || 'Failed to create activation code')
    } finally {
      setIssuing(false)
    }
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(newCode.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const buy = async (e) => {
    e.preventDefault()
    setBuying(true)
    try {
      const res = await purchaseLicense({ deviceLabel: buyLabel.trim() })
      setNewCode(res)
      setBuyOpen(false)
      setBuyLabel('')
      load()
    } catch (err) {
      toast.error(err.message || 'Purchase failed')
    } finally {
      setBuying(false)
    }
  }

  // Pay for the just-created pending purchase — code is already revealed
  // once above; payment settles independently (Paynow trigger / Stripe webhook).
  const payVia = async (provider) => {
    const purchaseId = newCode?.purchase?.id
    if (!purchaseId || !tenant?.id) return
    setBuying(true)
    try {
      if (provider === 'stripe') {
        const { url } = await purchaseStripeCheckout(purchaseId)
        window.location.href = url
        return
      }
      const { reference, browserUrl } = await initiatePaynowCheckout({
        tenantId: tenant.id,
        amount: 150,
        items: [{ name: 'TengaPOS Desktop License (once-off)', qty: 1, price: 150 }],
      })
      await linkPurchasePayment(purchaseId, reference)
      window.location.href = browserUrl
    } catch (err) {
      toast.error(err.message || 'Payment failed to start')
      setBuying(false)
    }
  }

  const revokeCode = async (codeId) => {
    try {
      await revokeActivationCode(codeId)
      toast.success('Code revoked')
      load()
    } catch (err) { toast.error(err.message) }
  }

  const confirmRevokeDevice = async () => {
    try {
      await revokeDevice(revoking.id, 'revoked_by_owner')
      toast.success(`${revoking.name} revoked — takes effect on its next check-in`)
      setRevoking(null)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const reinstate = async (device) => {
    try {
      await unrevokeDevice(device.id)
      toast.success(`${device.name} reinstated`)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const activeDevices = useMemo(() => devices.filter((d) => d.status === 'active'), [devices])

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Desktop App</h1>
          <p className="text-sm text-slate-500">
            Offline-capable Windows terminals for this business · {activeDevices.length} active
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* How it works + download */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-xl bg-brand-100 p-2.5 dark:bg-brand-900/40">
              <Download className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            </div>
            <h2 className="font-bold text-slate-900 dark:text-white">1. Install the app</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Download the Windows installer on the till or office PC. The app works fully
            offline after activation — sales, inventory and receipts all run locally.
          </p>
          {download ? (
            <a
              href={download.url}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
            >
              <Download className="h-4 w-4" />
              Download v{download.version} ({(download.size_bytes / 1048576).toFixed(0)} MB)
            </a>
          ) : (
            <p className="text-sm text-slate-400">No desktop release published yet — check back soon.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-3">
            <div className="rounded-xl bg-purple-100 p-2.5 dark:bg-purple-900/40">
              <KeyRound className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="font-bold text-slate-900 dark:text-white">2. Activate the device</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500">
            Generate a one-time product code here, then type it into the desktop app.
            Codes expire after <strong>15 minutes</strong> and bind to that single device —
            they can't be reused or moved to another machine. An <strong>active paid
            plan</strong> or a <strong>once-off $150 desktop license</strong> is
            required — desktop is never free or trialed.
          </p>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setBuyOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
              >
                <ShoppingCart className="h-4 w-4" /> Buy License — $150
              </button>
              <button
                onClick={() => setShowIssue(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" /> Code (plan seat)
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Only the business owner can issue activation codes.</p>
          )}
        </div>
      </div>

      {/* Devices */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-bold text-slate-900 dark:text-white">Activated Terminals</h2>
        </div>
        {devices.length === 0 ? (
          <div className="flex flex-col items-center py-14">
            <Laptop className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
            <p className="text-sm text-slate-500">No desktop terminals activated yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="rounded-xl bg-slate-100 p-2.5 dark:bg-slate-800">
                  <Monitor className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold text-slate-900 dark:text-white">{d.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[d.status]}`}>
                      {d.status}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                    <span>{d.app_version ? `v${d.app_version}` : 'version unknown'}{d.os ? ` · ${d.os}` : ''}</span>
                    <span className="flex items-center gap-1">
                      {d.last_checkin_at ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                      Last check-in: {fmt(d.last_checkin_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Lease expires: {fmt(d.lease_expires_at)}
                    </span>
                  </div>
                </div>
                {canManage && (
                  d.status === 'active' ? (
                    <button
                      onClick={() => setRevoking(d)}
                      className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      <Ban className="h-3.5 w-3.5" /> Revoke
                    </button>
                  ) : (
                    <button
                      onClick={() => reinstate(d)}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reinstate
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Activation codes */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-bold text-slate-900 dark:text-white">Activation Codes</h2>
        </div>
        {codes.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No codes issued yet</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {codes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <KeyRound className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">TGA-••••-{c.code_hint}</span>
                  <span className="ml-2 text-xs text-slate-500">{c.label || 'Terminal'}</span>
                  <div className="text-xs text-slate-400">
                    Created {fmt(c.created_at)} · Expires {fmt(c.expires_at)}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[c.status]}`}>
                  {c.status}
                </span>
                {canManage && c.status === 'pending' && (
                  <button onClick={() => revokeCode(c.id)} className="text-xs font-semibold text-red-500 hover:text-red-600">
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Purchased licenses */}
      {purchases.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-bold text-slate-900 dark:text-white">Purchased Licenses</h2>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {purchases.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <ShoppingCart className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 dark:text-white">${Number(p.amount).toFixed(2)} {p.currency}</span>
                  <span className="ml-2 text-xs text-slate-500">{p.source === 'staff' ? 'Issued by staff' : 'Self purchase'}</span>
                  <div className="text-xs text-slate-400">
                    {fmt(p.created_at)}{p.paid_at ? ` · Paid ${fmt(p.paid_at)}` : ''}{p.payment_ref ? ` · Ref ${p.payment_ref}` : ''}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${PURCHASE_STYLES[p.status]}`}>
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Buy license modal */}
      <Modal isOpen={buyOpen} onClose={() => setBuyOpen(false)} title="Buy Desktop License — $150 once-off">
        <form onSubmit={buy} className="space-y-4">
          <p className="text-sm text-slate-500">
            One purchase = one perpetual terminal license — no subscription needed.
            You get an activation code immediately; it activates once payment is confirmed.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Device label</label>
            <input
              value={buyLabel}
              onChange={(e) => setBuyLabel(e.target.value)}
              placeholder="e.g. Front Counter PC"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setBuyOpen(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">
              Cancel
            </button>
            <button type="submit" disabled={buying} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
              {buying ? 'Processing…' : 'Buy — $150'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Issue code modal */}
      <Modal isOpen={showIssue} onClose={() => setShowIssue(false)} title="New Activation Code">
        <form onSubmit={issue} className="space-y-4">
          <p className="text-sm text-slate-500">
            The code is shown once, expires in 15 minutes, and binds permanently to the
            device that uses it.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Device label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Front Counter PC"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowIssue(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">
              Cancel
            </button>
            <button type="submit" disabled={issuing} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
              {issuing ? 'Generating…' : 'Generate Code'}
            </button>
          </div>
        </form>
      </Modal>

      {/* One-time code reveal */}
      <Modal isOpen={!!newCode} onClose={() => setNewCode(null)} title="Activation Code — Save This Now">
        {newCode && (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              This code is shown <strong>once</strong> and cannot be recovered. It expires
              at {fmt(newCode.expires_at)}.
            </div>
            <div className="flex items-center justify-center gap-3 rounded-2xl bg-slate-100 py-6 dark:bg-slate-800">
              <span className="font-mono text-2xl font-extrabold tracking-widest text-slate-900 dark:text-white">
                {newCode.code}
              </span>
              <button onClick={copyCode} className="rounded-lg p-2 text-slate-500 hover:bg-white dark:hover:bg-slate-700" title="Copy">
                {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
              </button>
            </div>
            {newCode.purchase?.status === 'pending' && (
              <div className="space-y-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-900/30">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  Payment pending — the code unlocks the moment payment is confirmed.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => payVia('paynow')} disabled={buying}
                    className="flex-1 rounded-lg bg-green-600 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
                    Pay $150 with Paynow
                  </button>
                  <button onClick={() => payVia('stripe')} disabled={buying}
                    className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
                    Pay $150 with Card
                  </button>
                </div>
              </div>
            )}
            <p className="text-center text-xs text-slate-500">
              Type this code into the desktop app on the terminal you want to license.
            </p>
            <button onClick={() => setNewCode(null)} className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
              Done — I've saved it
            </button>
          </div>
        )}
      </Modal>

      {/* Revoke device confirm */}
      <Modal isOpen={!!revoking} onClose={() => setRevoking(null)} title={`Revoke ${revoking?.name || 'device'}?`}>
        {revoking && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              The terminal will be told to stop selling <strong>the next time it connects</strong> and
              checks in. A device that never reconnects keeps working until its license
              expires — revocation can't reach a permanently offline machine.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRevoking(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">
                Cancel
              </button>
              <button onClick={confirmRevokeDevice} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700">
                Revoke Terminal
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
