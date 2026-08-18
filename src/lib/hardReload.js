// A plain reload() still goes through whatever service worker is currently
// registered, which can just re-serve its own stale cache instead of
// reaching the network. Unregistering first (registerSW() in main.jsx
// re-registers a fresh one on the very next load either way) guarantees
// the reload actually reaches the network. Shared by the "new version
// available" toast, ErrorBoundary's stale-chunk auto-recovery, and the
// manual "Refresh Online Updates" button -- three different triggers for
// the same underlying need.
export async function hardReload() {
  // Reported live as "offline mode doesn't work at all" -- tracked down to
  // this: unregistering the service worker and deleting every cache
  // ALWAYS ran, even when the device genuinely had no connection to reload
  // into. A user hitting "Refresh Online Updates" specifically because
  // something wasn't syncing would, if they really were offline, have
  // their entire offline safety net destroyed right before a reload that
  // then had nothing left to fall back on -- turning "briefly offline"
  // into "the app won't load at all" until a good connection came back.
  // A real network probe first (a tiny, always-precached asset, no-store
  // so it can't be answered from cache) means the teardown only happens
  // when the reload can actually succeed off the network afterward.
  try {
    await fetch('/favicon.png', { cache: 'no-store' })
  } catch {
    window.location.reload()
    return
  }
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
