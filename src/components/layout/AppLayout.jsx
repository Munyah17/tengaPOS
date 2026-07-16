import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useAuthStore } from '@/stores/authStore'
import { startBackgroundSync } from '@/lib/offlineSync'
import toast from 'react-hot-toast'

export default function AppLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const { tenant } = useAuthStore()

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = mobileSidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileSidebarOpen])

  // Cloud-based but offline-first: cache products for offline POS use and
  // replay any sales queued while the connection was down.
  useEffect(() => {
    if (!tenant?.id) return
    return startBackgroundSync(tenant.id, {
      onSynced: ({ synced }) => toast.success(`Synced ${synced} offline sale${synced !== 1 ? 's' : ''}`),
    })
  }, [tenant?.id])

  // Quietly reconfirm the offline-cached session against the server on the
  // same rhythm as data sync — immediately once online, then every 5
  // minutes. Locks the account only on a genuine identity mismatch; a
  // network hiccup here does nothing (see validateSession).
  useEffect(() => {
    const tick = () => useAuthStore.getState().validateSession()
    tick()
    const interval = setInterval(tick, 5 * 60 * 1000)
    window.addEventListener('online', tick)
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', tick)
    }
  }, [])

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950" style={{ height: '100dvh' }}>
      <Sidebar open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
