import { useState, useEffect } from 'react'
import { Trash2, AlertTriangle, CloudUpload } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { fetchAllSyncQueueItems, retrySyncItem, removeSyncQueueItem } from '@/db'
import { processSyncQueue } from '@/lib/offlineSync'
import { formatDateTime } from '@/utils/formatters'
import toast from 'react-hot-toast'

const LABELS = {
  checkout: 'POS Sale',
  inventory: 'Inventory Update',
}

// Self-serve recovery for the offline sync queue -- lets whoever's on this
// device see exactly what's stuck and why, retry it once they've fixed the
// underlying cause (restocked the item, etc), or discard it, rather than
// staring at a "pending" count with no way to act on it themselves.
export default function SyncQueueManager({ isOpen, onClose, onChanged }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = () => {
    setLoading(true)
    fetchAllSyncQueueItems().then(setItems).catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { if (isOpen) load() }, [isOpen])

  const handleRetry = async (item) => {
    setBusyId(item.id)
    try {
      await retrySyncItem(item.id)
      const result = await processSyncQueue()
      if (result.synced > 0) toast.success('Synced')
      else if (result.permanentlyFailed > 0) toast.error('Still failing — same issue as before')
      else toast('Queued for the next sync attempt', { icon: '🔄' })
      load()
      onChanged?.()
    } catch (err) {
      toast.error(err.message || 'Failed to retry')
    } finally {
      setBusyId(null)
    }
  }

  const handleDiscard = async (item) => {
    if (!window.confirm('Discard this item permanently? This cannot be undone — if it was a sale, it will NOT be recorded.')) return
    setBusyId(item.id)
    try {
      await removeSyncQueueItem(item.id)
      load()
      onChanged?.()
      toast.success('Discarded')
    } catch (err) {
      toast.error(err.message || 'Failed to discard')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Offline Sync Queue" size="lg">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Sales and inventory edits saved on this device while offline (or during a connection issue), waiting to reach the server.
        </p>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">Nothing queued — everything's synced.</div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-3 ${item.failed ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30' : 'border-slate-200 dark:border-slate-700'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {item.failed
                        ? <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                        : <CloudUpload className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />}
                      {LABELS[item.table_name] || item.table_name}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(item.created_at)}</p>
                    {item.failed && item.last_error && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{item.last_error}</p>
                    )}
                    {!item.failed && (
                      <p className="mt-1 text-xs text-slate-400">
                        {item.retries > 0 ? `Retried ${item.retries} time${item.retries !== 1 ? 's' : ''} — still trying` : 'Waiting for the next sync attempt'}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 gap-1.5">
                    {item.failed && (
                      <button
                        onClick={() => handleRetry(item)}
                        disabled={busyId === item.id}
                        className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={() => handleDiscard(item)}
                      disabled={busyId === item.id}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950"
                      title="Discard"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
