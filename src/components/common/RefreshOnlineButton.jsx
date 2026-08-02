import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { cacheProductsForOffline, processSyncQueue } from '@/lib/offlineSync'

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
    if (!navigator.onLine) {
      toast.error("You're offline — reconnect to pull fresh updates")
      return
    }
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
      // A plain reload still goes through the service worker, which can
      // just re-serve its own cached shell instead of hitting the network
      // — whether that happens to coincide with a truly fresh fetch is
      // timing-dependent, which is why this button could take several
      // clicks before it visibly did anything. Unregistering it and
      // wiping its caches first removes anything that could intercept
      // this one reload, so it's guaranteed to go to the network. Safe to
      // do here specifically because registerSW() in main.jsx re-registers
      // a fresh service worker on the very next load — this doesn't
      // disable offline support generally, only forces this one reload
      // to bypass it.
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map((r) => r.unregister()))
        }
        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        }
      } catch {
        // Best-effort — still reload below even if this couldn't complete
      }
      window.location.reload()
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
