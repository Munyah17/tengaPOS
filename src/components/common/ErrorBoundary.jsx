import { Component } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

// Without this, any uncaught render error anywhere in the app unmounts the
// entire React tree to a blank white page — which a cashier mid-sale reads
// as "the app crashed and jumped somewhere else."  This catches it instead
// and offers a reload, and it's the last line of defense — real bugs (like
// the null-sku search crash) should still be fixed at the source.

// Every deploy replaces this app's JS chunk files with new, differently
// -hashed ones. Anyone who already had the app open in their browser before
// a deploy is still holding the old filenames — the moment they navigate to
// a lazy-loaded page (any route other than the one they landed on), the
// browser tries to fetch a chunk that's already been replaced and gets a
// 404: "Failed to fetch dynamically imported module." This isn't a bug in
// that page's code, it's a stale reference — reloading fixes it by pulling
// the current index.html and its matching chunk manifest, so we do that
// automatically instead of leaving the cashier stuck looking at an error.
const CHUNK_RELOAD_KEY = 'tengapos_chunk_reload_attempted'
function isChunkLoadError(error) {
  const msg = error?.message || ''
  return /fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(msg)
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, autoReloading: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidMount() {
    // A normal, error-free mount means the app is stable on the current
    // deploy — clear the guard so a *later* deploy this same tab session
    // can still trigger one automatic reload rather than staying blocked.
    try { sessionStorage.removeItem(CHUNK_RELOAD_KEY) } catch { /* ignore */ }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info)
    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
          this.setState({ autoReloading: true })
          window.location.reload()
        }
      } catch { /* sessionStorage unavailable — fall through to manual reload button */ }
    }
  }

  render() {
    if (this.state.autoReloading) {
      // Reload is already in flight (see componentDidCatch) — show a
      // specific, reassuring message instead of the generic error screen
      // for the split-second before the page actually refreshes.
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-950">
          <RefreshCw className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-slate-500 dark:text-slate-400">A newer version is available — updating…</p>
        </div>
      )
    }
    if (this.state.hasError) {
      // fullPage=false is used per-route (inside AppLayout) so one page
      // crashing doesn't take the sidebar/topbar down with it — the cashier
      // can still navigate elsewhere instead of being stuck on a dead screen.
      const fullPage = this.props.fullPage !== false
      return (
        <div className={`flex flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-950 ${fullPage ? 'min-h-screen' : 'min-h-[60vh]'}`}>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Something went wrong</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Your data is safe. Reloading usually fixes this.
            </p>
          </div>
          {this.state.error?.message && (
            <p className="max-w-md break-words rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
