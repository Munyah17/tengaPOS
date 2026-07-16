import { Component } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

// Without this, any uncaught render error anywhere in the app unmounts the
// entire React tree to a blank white page — which a cashier mid-sale reads
// as "the app crashed and jumped somewhere else."  This catches it instead
// and offers a reload, and it's the last line of defense — real bugs (like
// the null-sku search crash) should still be fixed at the source.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info)
  }

  render() {
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
