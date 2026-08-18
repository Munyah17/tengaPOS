import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { cacheProductsForOffline, processSyncQueue } from '@/lib/offlineSync'
import { hardReload } from '@/lib/hardReload'

// A pressure-release valve for offline caching: with so many pages now
// serving cached data first, this forces every page to go back to the
// network right now — refetches every React Query, tells plain-state pages
// to reload (via a shared event), and drains/refreshes the offline sync
// layer — instead of waiting for staleTime windows or the background
// sync's own interval.
//
// invalidateQueries() only actually refetches queries that are currently
// mounted/observed — anything not on screen right now just gets marked
// stale, not refetched, and any plain useState page whose own
// force-refresh listener has a subtle bug shows the same false-positive:
// a successful-looking "Up to date" toast with a screen that hasn't
// actually changed. A full reload sidesteps all of that — it always shows
// exactly what the server has right now, with no page-by-page guessing.
export default function RefreshOnlineButton() {
  const [refreshing, setRefreshing] = useState(false)
  const queryClient = useQueryClient()
  const { tenant } = useAuthStore()

  const handleRefresh = async () => {
    // Deliberately no navigator.onLine pre-check -- this button exists
    // specifically as the manual "force it now" escape hatch, and that
    // API is known to report the wrong value on some networks (see
    // offlineSync.js's startBackgroundSync). Refusing to even attempt a
    // refresh based on it meant the one recovery path a frustrated user
    // has could silently refuse to work right when they needed it most.
    // A real attempt either succeeds or fails on its own -- the catch
    // below and hardReload() already handle a genuine offline device fine.
    setRefreshing(true)
    try {
      window.dispatchEvent(new CustomEvent('tengapos:force-refresh'))
      await queryClient.invalidateQueries()
      if (tenant?.id) {
        await cacheProductsForOffline(tenant.id)
        await processSyncQueue()
      }
    } catch {
      // Non-fatal — the reload below still pulls a fully fresh copy of the page
    } finally {
      // hardReload unregisters the service worker and clears its caches
      // first, so this reload can't be served from a stuck old worker
      // instead of the network — see src/lib/hardReload.js.
      await hardReload()
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      title="Refresh Online Updates"
      className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      <RefreshCw className={`h-3.5 w-3.5 flex-shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
      <span className="hidden lg:inline">Refresh Online Updates</span>
      <span className="lg:hidden">Refresh</span>
    </button>
  )
}
