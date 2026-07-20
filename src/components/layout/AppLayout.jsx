import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useAuthStore } from '@/stores/authStore'
import { useReceiptConfigStore } from '@/stores/receiptConfigStore'
import { useFiscalStore } from '@/stores/fiscalStore'
import { startBackgroundSync } from '@/lib/offlineSync'
import { fetchEffectiveReceiptConfig } from '@/lib/db'
import { loadWithOfflineCache } from '@/lib/offlineCache'
import { applyWhitelabelTheme, clearWhitelabelTheme } from '@/lib/whitelabelTheme'
import { supabase } from '@/lib/supabase'
import ErrorBoundary from '@/components/common/ErrorBoundary'
import toast from 'react-hot-toast'

export default function AppLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const { tenant, branch } = useAuthStore()
  const location = useLocation()

  // Real, persisted receipt branding — loaded here (not just when Settings
  // happens to be visited) so every role gets correctly-branded receipts,
  // not just whoever last opened the Fiscalisation/Receipts Config page.
  // Wrapped in the shared IndexedDB offline cache so an offline relaunch or
  // a failed fetch keeps printing the tenant's real details instead of
  // silently reverting to demo placeholders.
  useEffect(() => {
    if (!tenant?.id) return
    const scopeKey = `${tenant.id}:${branch?.id || ''}`
    const loadReceiptConfig = () => loadWithOfflineCache(
      ['effectiveReceiptConfig', tenant.id, branch?.id],
      () => fetchEffectiveReceiptConfig(tenant.id, branch?.id || null),
      { onData: (row) => useReceiptConfigStore.getState().loadFromDB(row, scopeKey) },
    )
    loadReceiptConfig()
    window.addEventListener('tengapos:force-refresh', loadReceiptConfig)
    return () => window.removeEventListener('tengapos:force-refresh', loadReceiptConfig)
  }, [tenant?.id, branch?.id])

  // Fiscal config too — previously only loaded when a Vendor opened the
  // Settings/Fiscalisation pages, so cashier sessions printed receipts with
  // an empty fiscal store (no branch branding fallback, no FDMS submission).
  // Same cache key the Fiscalisation page uses, so they share one copy.
  useEffect(() => {
    if (!tenant?.id) return
    const loadFiscalConfig = () => loadWithOfflineCache(
      ['fiscalConfig', tenant.id],
      () => supabase.from('tenant_fiscal_configs')
        .select('*')
        .eq('tenant_id', tenant.id)
        .maybeSingle()
        .then(({ data, error }) => { if (error) throw error; return data }),
      { onData: (data) => { if (data) useFiscalStore.getState().loadFromDB(data) } },
    )
    loadFiscalConfig()
    window.addEventListener('tengapos:force-refresh', loadFiscalConfig)
    return () => window.removeEventListener('tengapos:force-refresh', loadFiscalConfig)
  }, [tenant?.id])

  // White-label: re-skin the whole portal (brand colour palette, favicon,
  // page title) for tenants with the white-label add-on. Cleared on
  // logout/unmount so the login screen and admin portal stay tengaPOS.
  useEffect(() => {
    applyWhitelabelTheme(tenant?.whitelabel)
    return () => clearWhitelabelTheme()
  }, [tenant?.whitelabel])

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

  // A plan approval or trial extension can happen while the tenant already
  // has this tab open (Super Admin approving them, or a payment webhook
  // firing) — without this, the trial banner and gated features would stay
  // stuck on stale data until the user manually logs out and back in.
  useEffect(() => {
    if (!tenant?.id) return
    const channel = supabase
      .channel(`tenant-live-${tenant.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'tenants',
        filter: `id=eq.${tenant.id}`,
      }, (payload) => {
        useAuthStore.getState().updateTenant(payload.new)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tenant?.id])

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950" style={{ height: '100dvh' }}>
      <Sidebar open={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {/* Keyed by path so a crash on one page doesn't take the sidebar/topbar
              down with it, and navigating away recovers cleanly instead of
              staying stuck on the fallback screen. */}
          <ErrorBoundary key={location.pathname} fullPage={false}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
