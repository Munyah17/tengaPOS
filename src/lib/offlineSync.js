// Cloud-based but offline-first: cache products locally so the POS keeps
// working with no connection, queue sales made while offline, and
// periodically sync everything back to Supabase in the background.
import { db, addToSyncQueue, getSyncQueueItems, removeSyncQueueItem, markSyncItemFailed } from '@/db'
import { fetchProducts, saveCheckout, insertProduct, updateProduct } from '@/lib/db'
import { generateUUID } from '@/lib/uuid'

// A business-logic failure (out of stock by the time this replayed) can
// never be fixed by retrying it again -- looping forever accomplishes
// nothing and just hides the problem behind an endless "pending" count.
// These get pulled into the `failed` bucket instead (see db/index.js),
// where a person can see and act on them. Matches the same wording the
// live (non-queued) checkout path already hard-stops on. "invalid input
// syntax" is a data-shape problem (a malformed value hit a strongly-typed
// column) — retrying the exact same payload forever can never fix it either.
const PERMANENT_ERROR_PATTERNS = [/insufficient stock/i, /stock check failed/i, /invalid input syntax/i]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function cacheProductsForOffline(tenantId) {
  try {
    const products = await fetchProducts(tenantId)
    await db.products.where('tenant_id').equals(tenantId).delete()
    await db.products.bulkPut(products.map((p) => ({ ...p, tenant_id: tenantId })))
    return products
  } catch {
    // Offline or request failed — callers fall back to getOfflineProducts
    return null
  }
}

export async function getOfflineProducts(tenantId) {
  return db.products.where('tenant_id').equals(tenantId).toArray()
}

export async function queueOfflineSale(payload) {
  await addToSyncQueue('checkout', 'create', payload)
}

/** Queues a product add/edit made while offline (or mid-save on a network
 *  failure) for replay once connectivity returns — same treatment as
 *  offline POS checkout, the other priority write path. */
export async function queueOfflineInventoryWrite(operation, tenantId, payload, productId = null) {
  await addToSyncQueue('inventory', operation, { tenantId, productId, payload })
}

// Only counts items still being auto-retried — a permanently-failed item
// (see failedSyncCount) needs a person, not just more waiting, so it's
// tracked separately rather than inflating this indefinitely.
export async function pendingSyncCount() {
  return db.syncQueue.where('failed').equals(0).count()
}

export async function failedSyncCount() {
  return db.syncQueue.where('failed').equals(1).count()
}

/** Replays any queued offline writes (POS checkout + Inventory). Safe to call
 *  repeatedly. Does NOT pre-check navigator.onLine — that flag is only a
 *  hint and can wrongly report offline on some networks (see handleCheckout
 *  in POS.jsx), which previously left queued sales stuck forever on
 *  affected connections even though they'd have synced fine. A transient
 *  failure (still offline, a server hiccup) is just retried next interval —
 *  no attempt cap, so it's self-healing the moment the connection is (or
 *  already was) working, instead of silently giving up after a fixed
 *  number of tries. A permanent, business-logic failure is pulled out of
 *  the retry pool instead (see PERMANENT_ERROR_PATTERNS) since retrying it
 *  can never succeed on its own. */
export async function processSyncQueue() {
  const items = await getSyncQueueItems()
  let synced = 0
  let retried = 0
  let permanentlyFailed = 0
  for (const item of items) {
    try {
      if (item.table_name === 'checkout') {
        // Sales queued before the crypto.randomUUID fallback fix could have
        // a malformed (non-UUID) clientRef baked into their stored payload —
        // saveCheckout only generates a fresh one when none is present, so
        // replaying item.data as-is would repeat the exact same "invalid
        // input syntax for type uuid" failure forever. Since that error
        // means nothing was ever inserted server-side (no idempotency was
        // ever established), replacing it with a newly-generated valid UUID
        // here is safe and lets the sale go through instead of being stuck.
        if (item.data?.clientRef && !UUID_RE.test(item.data.clientRef)) {
          item.data = { ...item.data, clientRef: generateUUID() }
          await db.syncQueue.update(item.id, { data: item.data })
        }
        await saveCheckout(item.data)
      } else if (item.table_name === 'inventory') {
        const { operation, data } = item
        if (operation === 'insert') {
          await insertProduct(data.tenantId, data.payload)
        } else {
          await updateProduct(data.productId, data.payload)
        }
      } else {
        continue
      }
      await removeSyncQueueItem(item.id)
      synced += 1
    } catch (err) {
      const msg = err?.message || ''
      if (PERMANENT_ERROR_PATTERNS.some((p) => p.test(msg))) {
        await markSyncItemFailed(item.id, err)
        permanentlyFailed += 1
      } else {
        await db.syncQueue.update(item.id, { retries: (item.retries || 0) + 1 })
        retried += 1
      }
    }
  }
  return { synced, retried, permanentlyFailed }
}

/**
 * Starts the background offline-sync loop: periodically refreshes the
 * product cache and drains the sync queue while online, and immediately
 * drains the queue the moment connectivity returns. Returns a cleanup fn.
 */
export function startBackgroundSync(tenantId, { intervalMs = 15000, onSynced, onFailed } = {}) {
  if (!tenantId) return () => {}

  const tick = async () => {
    if (!navigator.onLine) return
    await cacheProductsForOffline(tenantId)
    const result = await processSyncQueue()
    if (result.synced > 0) onSynced?.(result)
    if (result.permanentlyFailed > 0) onFailed?.(result)
  }

  tick()
  const interval = setInterval(tick, intervalMs)
  const onOnline = () => tick()
  window.addEventListener('online', onOnline)

  return () => {
    clearInterval(interval)
    window.removeEventListener('online', onOnline)
  }
}
