// Cloud-based but offline-first: cache products locally so the POS keeps
// working with no connection, queue sales made while offline, and
// periodically sync everything back to Supabase in the background.
import { db, addToSyncQueue, getSyncQueueItems, removeSyncQueueItem, markSyncItemFailed } from '@/db'
import {
  fetchProducts, saveCheckout, insertProduct, updateProduct,
  receiveStock, adjustStockByDelta, transferStock, requestVoid, requestReturn, recordStockTakeCount,
} from '@/lib/db'
import { generateUUID } from '@/lib/uuid'

// A business-logic failure (out of stock by the time this replayed) can
// never be fixed by retrying it again -- looping forever accomplishes
// nothing and just hides the problem behind an endless "pending" count.
// These get pulled into the `failed` bucket instead (see db/index.js),
// where a person can see and act on them. Matches the same wording the
// live (non-queued) checkout path already hard-stops on. "invalid input
// syntax" is a data-shape problem (a malformed value hit a strongly-typed
// column) — retrying the exact same payload forever can never fix it either.
// A discount authorization is only valid for 3 minutes (see
// discount_authorizations.expires_at) -- if a sale with one attached hits
// a genuine network failure right after authorizing and gets queued, a
// replay minutes/hours later will find it expired every single time.
// Retrying can never fix that (the manager would need to re-authorize,
// which requires the cashier to be back at the till with them present),
// so this needs the same "give up and surface it" treatment as insufficient
// stock, not endless silent retries.
const PERMANENT_ERROR_PATTERNS = [
  /insufficient stock/i, /stock check failed/i, /invalid input syntax/i, /discount authorization/i, /total exceeds the priced value/i,
  // The newer queueable actions below (receive/adjust/transfer stock, void
  // and return requests, stock-take counts) each have their own class of
  // "retrying this exact payload can never succeed" failure -- the product
  // was deleted since, the order's request already went through some
  // other way, the stock-take session was finalized before this queued
  // count ever got a chance to sync. Same reasoning as insufficient stock
  // above: surface it for a person to look at, not loop forever.
  /product not found/i, /services don't carry stock/i, /source and destination branch must be different/i,
  /already pending or completed/i, /order not found/i, /reason is required/i, /refund amount/i,
  /stock take not found/i, /already completed/i, /counted quantity cannot be negative/i,
]

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

// Generic queue entry for every other day-to-day action that can happen
// with no connection: receiving/adjusting/transferring stock, requesting
// a void or return, counting a product into an open stock take. One
// shape (table_name doubles as the action type here, 'create' throughout
// since none of these are edits-of-a-queued-item) instead of a bespoke
// queue* function per action -- see processSyncQueue's REPLAY_ACTIONS
// for what each one actually does on replay.
export async function queueOfflineAction(actionType, payload) {
  await addToSyncQueue(actionType, 'create', payload)
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

// One entry per action queueOfflineAction can queue -- payload shape is
// whatever that call site packed in, replayed against the real RPC
// wrapper exactly as if it had been called live.
const REPLAY_ACTIONS = {
  receive_stock: (data) => receiveStock(data.tenantId, data.productId, data.qty, data.note),
  // Deliberately delta, not adjustStock's absolute set -- see
  // adjust_stock_by_delta's own migration comment for why a queued
  // correction can't safely replay as "set to X" after sitting for a
  // while.
  adjust_stock: (data) => adjustStockByDelta(data.tenantId, data.productId, data.delta, data.note),
  transfer_stock: (data) => transferStock(data.tenantId, data.productId, data.toBranchId, data.qty, data.note),
  void_request: (data) => requestVoid(data.orderId, data.reason),
  return_request: (data) => requestReturn(data.orderId, data.reason, data.refundAmount),
  stock_take_count: (data) => recordStockTakeCount(data.stockTakeId, data.productId, data.countedQty, data.note),
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
      } else if (REPLAY_ACTIONS[item.table_name]) {
        await REPLAY_ACTIONS[item.table_name](item.data)
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

  // Reported live: offline mode "not working" on devices where it turned
  // out navigator.onLine was the actual culprit -- it only reflects
  // whether a network interface is up (WiFi/ethernet link), not whether
  // the connection can actually reach anything, and is well known to
  // report the wrong value on some networks (see POS.jsx's checkout,
  // which already avoids trusting it for exactly this reason). Gating
  // the entire tick on it meant a false "offline" reading silently
  // stopped both the product-cache refresh AND the sync queue drain
  // indefinitely, with nothing on screen to explain why. Just attempt
  // both every tick instead -- a genuinely offline device fails the
  // fetch fast on its own (cacheProductsForOffline already catches that
  // and falls back to the last-known cache; processSyncQueue already
  // classifies a real connectivity failure as retry-later, not an error).
  const tick = async () => {
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
