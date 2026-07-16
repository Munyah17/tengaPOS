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
      toast.success('Up to date')
    } catch {
      toast.error('Refresh failed — check your connection')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      title="Refresh Online Updates"
      className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800 sm:flex"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
      <span className="hidden lg:inline">Refresh Online Updates</span>
      <span className="lg:hidden">Refresh</span>
    </button>
  )
}
