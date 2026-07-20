// Cloud-based but offline-first: cache products locally so the POS keeps
// working with no connection, queue sales made while offline, and
// periodically sync everything back to Supabase in the background.
import { db, addToSyncQueue, getSyncQueueItems, removeSyncQueueItem } from '@/db'
import { fetchProducts, saveCheckout, insertProduct, updateProduct } from '@/lib/db'

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

export async function pendingSyncCount() {
  return db.syncQueue.count()
}

/** Replays any queued offline writes (POS checkout + Inventory). Safe to call repeatedly. */
export async function processSyncQueue() {
  if (!navigator.onLine) return { synced: 0, failed: 0 }
  const items = await getSyncQueueItems()
  let synced = 0
  let failed = 0
  for (const item of items) {
    try {
      if (item.table_name === 'checkout') {
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
    } catch {
      await db.syncQueue.update(item.id, { retries: (item.retries || 0) + 1 })
      failed += 1
    }
  }
  return { synced, failed }
}

/**
 * Starts the background offline-sync loop: periodically refreshes the
 * product cache and drains the sync queue while online, and immediately
 * drains the queue the moment connectivity returns. Returns a cleanup fn.
 */
export function startBackgroundSync(tenantId, { intervalMs = 60000, onSynced } = {}) {
  if (!tenantId) return () => {}

  const tick = async () => {
    if (!navigator.onLine) return
    await cacheProductsForOffline(tenantId)
    const result = await processSyncQueue()
    if (result.synced > 0) onSynced?.(result)
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
