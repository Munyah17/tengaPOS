import './polyfills.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import toast from 'react-hot-toast'
import App from './App.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// The service worker updates itself in the background (registerType:
// 'autoUpdate'), but that alone never tells an already-open tab to
// actually use the new version — someone could sit on a stale build
// indefinitely, silently missing new features, with nothing visibly
// "broken" to tip them off. This surfaces it explicitly and lets them
// choose when to reload, rather than forcing it mid-transaction.
//
// The browser itself only re-checks the service worker script for changes
// on a fresh navigation/reload — a POS terminal or workshop tablet that's
// been left open (tab never closed) for days never triggers that check at
// all, so it silently keeps running whatever build it loaded on first open,
// forever, with no visible sign anything's wrong. onRegisteredSW below adds
// an explicit periodic check so a long-lived tab still discovers new
// deploys instead of only ever checking once at initial load.
const SW_UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return
    setInterval(() => { registration.update().catch(() => {}) }, SW_UPDATE_CHECK_INTERVAL_MS)
  },
  onNeedRefresh() {
    toast(
      (t) => (
        <span className="flex items-center gap-3">
          <span>A new version is available</span>
          <button
            onClick={() => { toast.dismiss(t.id); window.location.reload() }}
            className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-brand-700"
          >
            Refresh
          </button>
        </span>
      ),
      { duration: Infinity, id: 'sw-update-available' },
    )
  },
})
