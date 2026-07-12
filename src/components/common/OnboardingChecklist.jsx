import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, Circle, X, Rocket } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

// A lightweight "getting started" checklist for brand-new businesses —
// helps familiarise the vendor with inventory, a first sale, payments (API
// keys), and the optional ZIMRA fiscalisation add-on. Steps are verified
// against real data, not just checked off by hand.
export default function OnboardingChecklist({ totalProducts }) {
  const { tenant, initAuth } = useAuthStore()
  const [lifetimeOrders, setLifetimeOrders] = useState(null)
  const [hidden, setHidden] = useState(tenant?.onboarding_done === true)

  useEffect(() => {
    if (!tenant?.id || hidden) return
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .then(({ count }) => setLifetimeOrders(count ?? 0))
  }, [tenant?.id, hidden])

  if (hidden || !tenant) return null

  const hasPayment = !!(tenant.paynow_integration_id || tenant.stripe_publishable_key)
  const hasFiscal = tenant.features?.fiscalisation === true

  const steps = [
    { key: 'product', label: 'Add your first product', done: (totalProducts ?? 0) > 0, to: '/app/inventory' },
    { key: 'sale', label: 'Make your first sale', done: (lifetimeOrders ?? 0) > 0, to: '/app/pos' },
    { key: 'payment', label: 'Connect a payment provider (Paynow or Stripe)', done: hasPayment, to: '/app/settings' },
    { key: 'fiscal', label: 'Request ZIMRA Fiscalisation (optional)', done: hasFiscal, to: '/app/settings', optional: true },
  ]
  const doneCount = steps.filter((s) => s.done).length

  const dismiss = async () => {
    setHidden(true)
    if (tenant?.id) {
      await supabase.from('tenants').update({ onboarding_done: true }).eq('id', tenant.id)
      initAuth()
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-800/50 dark:bg-indigo-950/20">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-indigo-900 dark:text-indigo-200">Getting Started</h3>
          <span className="rounded-full bg-indigo-600/10 px-2 py-0.5 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            {doneCount}/{steps.length}
          </span>
        </div>
        <button onClick={dismiss} className="rounded-lg p-1 text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <Link
            key={s.key}
            to={s.to}
            className="flex items-center gap-2.5 rounded-xl bg-white/70 px-3 py-2.5 text-sm transition-colors hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
          >
            {s.done
              ? <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
              : <Circle className="h-4 w-4 flex-shrink-0 text-slate-300 dark:text-slate-600" />}
            <span className={s.done ? 'text-slate-500 line-through' : 'text-slate-700 dark:text-slate-300'}>
              {s.label}{s.optional && !s.done && <span className="ml-1 text-xs text-slate-400">(optional)</span>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
