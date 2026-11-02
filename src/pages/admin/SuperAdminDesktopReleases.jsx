import { useCallback, useEffect, useState } from 'react'
import {
  Rocket, UploadCloud, RefreshCw, Ban, GitBranch, Percent,
  FileDown, CheckCircle2, MonitorDown,
} from 'lucide-react'
import Modal from '@/components/common/Modal'
import {
  listReleases, createRelease, patchRelease, uploadInstaller,
} from '@/lib/desktopLicense'
import toast from 'react-hot-toast'

const CHANNEL_STYLES = {
  stable: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  beta: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
}
const BLANK = {
  version: '', channel: 'beta', min_supported_version: '',
  rollout_pct: 100, release_notes_url: '',
}

export default function SuperAdminDesktopReleases() {
  const [releases, setReleases] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [file, setFile] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [rolloutEdit, setRolloutEdit] = useState(null) // { id, pct }
  const [withdrawing, setWithdrawing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { releases: r } = await listReleases()
      setReleases(r || [])
    } catch (err) {
      toast.error(err.message || 'Failed to load releases')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  const publish = async (e) => {
    e.preventDefault()
    if (!form.version.trim()) { toast.error('Version is required'); return }
    if (!file) { toast.error('Attach the installer file (.exe)'); return }
    setPublishing(true)
    try {
      const artifact = await uploadInstaller(file, form.version.trim(), 'win32-x64')
      await createRelease({
        version: form.version.trim(),
        channel: form.channel,
        min_supported_version: form.min_supported_version.trim() || '0.0.0',
        rollout_pct: Number(form.rollout_pct),
        release_notes_url: form.release_notes_url.trim() || null,
        artifacts: [artifact],
      })
      toast.success(`v${form.version} published to ${form.channel}`)
      setShowNew(false)
      setForm(BLANK)
      setFile(null)
      load()
    } catch (err) {
      toast.error(err.message || 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  const saveRollout = async () => {
    try {
      await patchRelease(rolloutEdit.id, { rollout_pct: Number(rolloutEdit.pct) })
      toast.success(`Rollout set to ${rolloutEdit.pct}%`)
      setRolloutEdit(null)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const promote = async (rel) => {
    try {
      await patchRelease(rel.id, { channel: 'stable' })
      toast.success(`v${rel.version} promoted to stable`)
      load()
    } catch (err) { toast.error(err.message) }
  }

  const confirmWithdraw = async () => {
    try {
      await patchRelease(withdrawing.id, { withdraw: true })
      toast.success(`v${withdrawing.version} withdrawn — devices won't be offered it`)
      setWithdrawing(null)
      load()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Desktop Releases</h1>
          <p className="text-sm text-slate-500">
            Signed update channels for the offline desktop app · {releases.length} release{releases.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <UploadCloud className="h-4 w-4" /> Publish Release
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        Publish to <strong>beta</strong> first with a low rollout %, verify on a staging
        machine (activation + update + relaunch), then promote to stable and raise the
        percentage. A withdrawn release is never offered again but doesn't uninstall from
        machines that already have it.
      </div>

      {releases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 dark:border-slate-700">
          <MonitorDown className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-500">No releases yet</p>
          <p className="mt-1 text-xs text-slate-400">Publish the first installer so tenants can download the desktop app</p>
        </div>
      ) : (
        <div className="space-y-3">
          {releases.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="rounded-xl bg-brand-100 p-2.5 dark:bg-brand-900/40">
                <Rocket className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-extrabold text-slate-900 dark:text-white">v{r.version}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CHANNEL_STYLES[r.channel]}`}>
                    {r.channel}
                  </span>
                  {r.withdrawn_at && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600 dark:bg-red-900/40 dark:text-red-400">
                      withdrawn
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {r.rollout_pct}% rollout
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    min v{r.min_supported_version}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
                  <span>Published {new Date(r.published_at).toLocaleString()}</span>
                  {(r.desktop_release_artifacts || []).map((a) => (
                    <span key={a.id} className="flex items-center gap-1">
                      <FileDown className="h-3 w-3" />
                      {a.os} · {(a.size_bytes / 1048576).toFixed(1)} MB · sha256 {a.sha256.slice(0, 12)}…
                    </span>
                  ))}
                  {r.release_notes_url && (
                    <a href={r.release_notes_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline dark:text-brand-400">
                      Release notes
                    </a>
                  )}
                </div>
              </div>
              {!r.withdrawn_at && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setRolloutEdit({ id: r.id, pct: r.rollout_pct })}
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Percent className="h-3.5 w-3.5" /> Rollout
                  </button>
                  {r.channel === 'beta' && (
                    <button
                      onClick={() => promote(r)}
                      className="flex items-center gap-1.5 rounded-xl border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30"
                    >
                      <GitBranch className="h-3.5 w-3.5" /> Promote to stable
                    </button>
                  )}
                  <button
                    onClick={() => setWithdrawing(r)}
                    className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Ban className="h-3.5 w-3.5" /> Withdraw
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Publish modal */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Publish Desktop Release">
        <form onSubmit={publish} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Version *</label>
              <input required value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="1.5.0"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Channel</label>
              <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                <option value="beta">beta</option>
                <option value="stable">stable</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Min supported version</label>
              <input value={form.min_supported_version} onChange={(e) => setForm({ ...form, min_supported_version: e.target.value })}
                placeholder="0.0.0"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Rollout %</label>
              <input type="number" min="0" max="100" value={form.rollout_pct}
                onChange={(e) => setForm({ ...form, rollout_pct: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Release notes URL</label>
            <input value={form.release_notes_url} onChange={(e) => setForm({ ...form, release_notes_url: e.target.value })}
              placeholder="https://…" type="url"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Installer (.exe) *</label>
            <input type="file" accept=".exe,application/octet-stream"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:file:bg-brand-900/40 dark:file:text-brand-300" />
            <p className="mt-1 text-xs text-slate-400">
              The SHA-256 is computed before upload and signed server-side — tampered
              installers can never pass verification on a device.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowNew(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">
              Cancel
            </button>
            <button type="submit" disabled={publishing} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
              {publishing ? 'Uploading & publishing…' : 'Publish'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Rollout modal */}
      <Modal isOpen={!!rolloutEdit} onClose={() => setRolloutEdit(null)} title="Adjust Rollout">
        {rolloutEdit && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Percentage of devices offered this version at their next update check
              (deterministic per device).
            </p>
            <input type="number" min="0" max="100" value={rolloutEdit.pct}
              onChange={(e) => setRolloutEdit({ ...rolloutEdit, pct: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            <div className="flex gap-3">
              <button onClick={() => setRolloutEdit(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">Cancel</button>
              <button onClick={saveRollout} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
                <CheckCircle2 className="mr-1 inline h-4 w-4" /> Save
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Withdraw confirm */}
      <Modal isOpen={!!withdrawing} onClose={() => setWithdrawing(null)} title={`Withdraw v${withdrawing?.version}?`}>
        {withdrawing && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Devices will no longer be offered this update. Devices that already
              installed it are unaffected. This can be reversed by re-publishing.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setWithdrawing(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold dark:border-slate-700 dark:text-white">Cancel</button>
              <button onClick={confirmWithdraw} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700">Withdraw</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
