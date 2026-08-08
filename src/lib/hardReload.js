// A plain reload() still goes through whatever service worker is currently
// registered, which can just re-serve its own stale cache instead of
// reaching the network. Unregistering first (registerSW() in main.jsx
// re-registers a fresh one on the very next load either way) guarantees
// the reload actually reaches the network. Shared by the "new version
// available" toast, ErrorBoundary's stale-chunk auto-recovery, and the
// manual "Refresh Online Updates" button -- three different triggers for
// the same underlying need.
export async function hardReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch { /* best-effort — still reload below even if this couldn't complete */ }
  window.location.reload()
}
