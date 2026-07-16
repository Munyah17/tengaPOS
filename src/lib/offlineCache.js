// Generic read-through cache for any React Query data, on top of the same
// IndexedDB (Dexie) database POS/Inventory already use for offline product
// data. Reuses the existing `settings` table (a plain key/value store) so no
// schema migration is needed — every page gets the same three guarantees:
//   1. Instant paint from whatever was last fetched, instead of a blank
//      loading state, the moment the page mounts.
//   2. If the network fetch fails (offline, or the request errors out),
//      fall back to that same last-known-good copy instead of an error.
//   3. Every successful fetch quietly refreshes the cache for next time.
import { db } from '@/db'

function cacheKey(key) {
  return Array.isArray(key) ? key.filter(Boolean).join(':') : String(key)
}

async function writeCache(key, value) {
  try {
    await db.settings.put({ key: cacheKey(key), value, cachedAt: Date.now() })
  } catch {
    // Best-effort — a failed cache write just means no offline fallback next time
  }
}

async function readCache(key) {
  try {
    const row = await db.settings.get(cacheKey(key))
    return row ? row.value : undefined
  } catch {
    return undefined
  }
}

// Plain read/write for pages using useState+useEffect instead of React
// Query — same underlying cache, just without the queryClient integration.
export const getCachedValue = readCache
export const setCachedValue = writeCache

/**
 * Wraps a fetcher for use as a React Query queryFn: caches every successful
 * result, and falls back to the last cached result if the fetch throws.
 * `key` should match the query's queryKey (array or string).
 */
export function withOfflineCache(key, fetcher) {
  return async () => {
    try {
      const fresh = await fetcher()
      writeCache(key, fresh)
      return fresh
    } catch (err) {
      const cached = await readCache(key)
      if (cached !== undefined) return cached
      throw err
    }
  }
}

/**
 * Seeds a React Query cache from IndexedDB before the query has resolved,
 * so the page paints real (if slightly stale) data immediately instead of a
 * loading spinner. Call once per query, keyed the same as the query itself.
 */
export async function seedFromOfflineCache(queryClient, queryKey) {
  if (queryClient.getQueryData(queryKey) !== undefined) return
  const cached = await readCache(queryKey)
  if (cached !== undefined) queryClient.setQueryData(queryKey, cached)
}

/**
 * Same cache-then-refresh behavior for pages using plain useState+useEffect
 * instead of React Query. Calls onData immediately with any cached value
 * (so the page paints instantly), then again with the fresh value once the
 * network call resolves — or leaves the cached value in place if the fetch
 * fails, only surfacing onError when there's nothing cached to fall back on.
 */
export async function loadWithOfflineCache(key, fetcher, { onData, onError, onLoadingChange } = {}) {
  const cached = await readCache(key)
  if (cached !== undefined) {
    onData?.(cached)
    onLoadingChange?.(false)
  } else {
    onLoadingChange?.(true)
  }
  try {
    const fresh = await fetcher()
    onData?.(fresh)
    writeCache(key, fresh)
  } catch (err) {
    if (cached === undefined) onError?.(err)
  } finally {
    onLoadingChange?.(false)
  }
}
