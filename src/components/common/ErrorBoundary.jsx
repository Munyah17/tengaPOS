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
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-950">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Something went wrong</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Your data is safe. Reloading usually fixes this.
            </p>
          </div>
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
