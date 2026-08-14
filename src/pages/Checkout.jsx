import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckCircle, ShieldCheck, Loader2, ArrowLeft, Banknote,
} from 'lucide-react'
import posIcon from '@/assets/pos-icon.png'
import paynowBanner from '@/assets/paynow-banner.svg'
import stripeBanner from '@/assets/stripe-banner.png'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { usePlanPricing } from '@/lib/platformSettings'
import toast from 'react-hot-toast'

const PLANS = [
  {
    key: 'byod_monthly',
    name: 'BYOD Monthly',
    price: 50,
    cycle: 'per month',
    desc: 'Use your own device',
    onboardingEligible: true,
    hosting: { monthly: 20, yearly: 200 },
    features: ['POS & Inventory', 'Transactions & Reports', 'Task manager', '1 branch · 3 users'],
  },
  {
    key: 'byod_yearly',
    name: 'BYOD Yearly',
    price: 600,
    cycle: 'per year',
    desc: 'Use your own device',
    onboardingEligible: true,
    hosting: { monthly: 20, yearly: 200 },
    features: ['Everything in BYOD Monthly'],
  },
  {
    key: 'standard_plan',
    name: 'Standard Plan',
    price: 170,
    cycle: 'once-off hardware · 6 months included',
    desc: '10″ tablet + thermal printer + software',
    popular: true,
    hosting: { monthly: 20, yearly: 200 },
    features: ['Everything in BYOD', 'Kitchen display & Orders', 'Staff management · 5 users'],
  },
  {
    key: 'pro_package',
    name: 'Pro Package',
    price: 200,
    cycle: 'once-off hardware · 6 months included',
    desc: '12″ tablet + thermal printer + software',
    hosting: { monthly: 35, yearly: 300 },
    features: ['Everything in Standard', 'Dining board & Drive-through', 'Advanced reports · 3 branches'],
  },
]

export default function Checkout() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { isAuthenticated, tenant, initAuth } = useAuthStore()
  const { pricing } = usePlanPricing()
  const planPrice = (plan) => pricing[plan.key]?.price ?? plan.price
  // Set server-side by notify_trial_reminders() from day 4 of the trial-
  // expired reminder sequence -- automatic, no promo code to type in. The
  // 10% math here must match signup-checkout's exactly (same rounding),
  // since what's shown here is a preview of what actually gets charged.
  const trialDiscountActive = !!tenant?.trial_discount_expires_at && new Date(tenant.trial_discount_expires_at) > new Date()
  const finalPrice = (plan) => trialDiscountActive ? Math.round(planPrice(plan) * 0.9 * 100) / 100 : planPrice(plan)
  const [selectedPlan, setSelectedPlan] = useState('standard_plan')
  const [wantsOnboarding, setWantsOnboarding] = useState(false)
  const [provider, setProvider] = useState('paynow')
  const [redirecting, setRedirecting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cashSubmitted, setCashSubmitted] = useState(false)

  const returnStatus = params.get('status')
  const returnRef = params.get('ref')

  const hasPaidPlan = !!tenant?.plan_start_date
  // Every plan (BYOD included, not just Standard/Pro hardware) activated
  // under the current pricing carries a real (even if already-past)
  // hosting_expires_at the moment it's approved -- see stripe-webhook/
  // paynow-signup-callback. A tenant from before this pricing existed has
  // this column null forever and is correctly never asked to pay it.
  const isHostingSubjectPlan = ['standard_plan', 'pro_package', 'byod_monthly', 'byod_yearly'].includes(tenant?.plan_type)
  const hostingSubject = isHostingSubjectPlan && !!tenant?.hosting_expires_at
  const hostingLapsed = hostingSubject && new Date(tenant.hosting_expires_at) < new Date()
  const [hostingPeriod, setHostingPeriod] = useState('monthly')
  const hostingTable = tenant?.plan_type ? PLANS.find((p) => p.key === tenant.plan_type)?.hosting : null

  useEffect(() => {
    if (!isAuthenticated) navigate('/login')
  }, [isAuthenticated, navigate])

  // Poll for webhook confirmation after returning from a provider
  useEffect(() => {
    if (!returnRef || !returnStatus || returnStatus === 'cancelled') return
    setConfirming(true)
    let tries = 0
    const timer = setInterval(async () => {
      tries += 1
      const { data } = await supabase
        .from('signup_checkouts')
        .select('status')
        .eq('reference', returnRef)
        .maybeSingle()
      if (data?.status === 'paid') {
        clearInterval(timer)
        await initAuth()
        toast.success('Payment confirmed — welcome aboard!')
        navigate('/app/dashboard')
      } else if (tries > 20) {
        clearInterval(timer)
        setConfirming(false)
        toast('Payment is still being confirmed. Your plan activates automatically once it clears.', { icon: '⏳' })
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [returnRef, returnStatus, initAuth, navigate])

  const startCheckout = async () => {
    setRedirecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body = hostingLapsed
        ? { type: 'hosting', period: hostingPeriod, provider, return_url: `${window.location.origin}/checkout` }
        : {
            plan_type: selectedPlan,
            provider,
            onboarding: wantsOnboarding,
            return_url: `${window.location.origin}/checkout`,
          }
      const { data, error } = await supabase.functions.invoke('signup-checkout', {
        body,
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (error) {
        let msg = error.message
        try {
          const ctx = await error.context?.json()
          if (ctx?.error) msg = ctx.error
        } catch { /* keep default */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      if (data?.cash) {
        // No redirect — this just queues the request for Super Admin to
        // confirm once the cash payment's actually been received.
        setCashSubmitted(true)
        setRedirecting(false)
        toast.success("Request sent — we'll activate your account once payment is confirmed")
        return
      }
      if (!data?.url) throw new Error('No checkout URL returned')
      // Full redirect to the hosted checkout — no payment details touch this app
      window.location.href = data.url
    } catch (err) {
      toast.error(err.message || 'Could not start checkout')
      setRedirecting(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 px-4 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-brand-400" />
        <h1 className="text-xl font-bold text-white">Confirming your payment…</h1>
        <p className="max-w-sm text-sm text-slate-400">
          We're waiting for the payment provider to confirm. This usually takes a few seconds.
        </p>
      </div>
    )
  }

  // A Standard/Pro tenant whose hosting has lapsed sees a dedicated
  // "pay your hosting" screen here instead of the plan grid -- they
  // already own the hardware, this is a different purchase, not a
  // re-selection of their plan.
  if (hostingLapsed && hostingTable) {
    const hostingAmount = hostingPeriod === 'yearly' ? hostingTable.yearly : hostingTable.monthly
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 px-4 py-10 sm:py-14">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 text-center">
            <img src={posIcon} alt="tengaPOS" className="mx-auto mb-4 h-12 w-auto" />
            <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Hosting payment due</h1>
            <p className="mt-2 text-sm text-slate-400">
              {tenant?.plan_type === 'standard_plan' || tenant?.plan_type === 'pro_package'
                ? 'Your hardware is already yours — this keeps your account, data, and support active.'
                : 'This keeps your account, data, and support active.'} Your data is safe either way.
            </p>
          </div>

          {cashSubmitted ? (
            <div className="rounded-2xl border-2 border-amber-500/70 bg-amber-500/10 p-5 text-center">
              <Banknote className="mx-auto mb-2 h-8 w-8 text-amber-400" />
              <h3 className="font-bold text-white">Request submitted</h3>
              <p className="mt-1 text-sm text-amber-200/80">
                We'll confirm your payment and reactivate hosting shortly.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {['monthly', 'yearly'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setHostingPeriod(p)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      hostingPeriod === p ? 'border-brand-500 bg-brand-500/10' : 'border-white/10 bg-white/5 hover:border-white/25'
                    }`}
                  >
                    <p className="text-2xl font-extrabold text-white">${p === 'yearly' ? hostingTable.yearly : hostingTable.monthly}</p>
                    <p className="text-xs text-slate-400">{p === 'yearly' ? 'per year' : 'per month'}</p>
                  </button>
                ))}
              </div>

              <p className="mb-2 mt-6 text-center text-xs font-bold uppercase tracking-widest text-slate-500">Pay with</p>
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => setProvider('paynow')} className={`flex items-center justify-center rounded-xl border px-4 py-3 transition-all ${provider === 'paynow' ? 'border-green-500 bg-white' : 'border-white/10 bg-white/90 hover:border-white/25'}`}>
                  <img src={paynowBanner} alt="Paynow" className="h-6 w-auto" />
                </button>
                <button onClick={() => setProvider('stripe')} className={`flex items-center justify-center rounded-xl border px-4 py-3 transition-all ${provider === 'stripe' ? 'border-indigo-500 bg-white' : 'border-white/10 bg-white/90 hover:border-white/25'}`}>
                  <img src={stripeBanner} alt="Stripe" className="h-6 w-auto" />
                </button>
                <button onClick={() => setProvider('cash')} className={`flex items-center justify-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-bold transition-all ${provider === 'cash' ? 'border-amber-500 bg-white text-amber-700' : 'border-white/10 bg-white/90 text-slate-700 hover:border-white/25'}`}>
                  <Banknote className="h-5 w-5" /> Cash
                </button>
              </div>

              <button
                onClick={startCheckout}
                disabled={redirecting}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {redirecting ? 'Redirecting…' : provider === 'cash' ? `Request Cash Payment — $${hostingAmount}` : `Continue to secure checkout — $${hostingAmount}`}
              </button>
            </>
          )}

          <p className="mt-6 text-center text-xs text-white">
            Need help? <a href="mailto:sales@tengapos.co.zw" className="text-brand-400 hover:text-brand-300">Contact sales</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <img src={posIcon} alt="tengaPOS" className="mx-auto mb-4 h-12 w-auto" />
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Choose your plan</h1>
          {hasPaidPlan ? (
            <p className="mt-2 text-sm text-slate-400">Manage or change your subscription</p>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Secure checkout — powered by Stripe & Paynow</p>
          )}
          {trialDiscountActive && (
            <p className="mt-2 text-sm text-green-300"><b>10% off is applied automatically</b> for a limited time.</p>
          )}
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <motion.button
              key={plan.key}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedPlan(plan.key)}
              className={`relative rounded-2xl border p-5 text-left transition-all ${
                selectedPlan === plan.key
                  ? 'border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10'
                  : 'border-white/10 bg-white/5 hover:border-white/25'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Popular
                </span>
              )}
              <p className="font-bold text-white">{plan.name}</p>
              <p className="text-xs text-slate-400">{plan.desc}</p>
              {trialDiscountActive ? (
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="text-sm text-slate-500 line-through">${planPrice(plan)}</span>
                  <span className="text-3xl font-extrabold text-green-400">${finalPrice(plan)}</span>
                </p>
              ) : (
                <p className="mt-3 text-3xl font-extrabold text-white">${planPrice(plan)}</p>
              )}
              <p className="text-xs text-slate-500">{plan.cycle}</p>
              {plan.hosting && (
                <p className="mt-0.5 text-xs font-semibold text-amber-400">
                  + ${plan.hosting.monthly}/mo or ${plan.hosting.yearly}/yr hosting (set up right after)
                </p>
              )}
              <ul className="mt-4 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-slate-300">
                    <CheckCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-green-400" />
                    {f}
                  </li>
                ))}
              </ul>
              {selectedPlan === plan.key && (
                <div className="absolute right-3 top-3">
                  <CheckCircle className="h-5 w-5 text-brand-400" />
                </div>
              )}
            </motion.button>
          ))}
        </div>

        {/* Payment method */}
        <div className="mx-auto mt-6 max-w-lg">
          {cashSubmitted ? (
            <div className="rounded-2xl border-2 border-amber-500/70 bg-amber-500/10 p-5 text-center">
              <Banknote className="mx-auto mb-2 h-8 w-8 text-amber-400" />
              <h3 className="font-bold text-white">Request submitted</h3>
              <p className="mt-1 text-sm text-amber-200/80">
                We'll activate your account as soon as your cash payment is confirmed. No further action needed here.
              </p>
            </div>
          ) : (
          <>
          {PLANS.find((p) => p.key === selectedPlan)?.onboardingEligible && (
            <label className="mb-4 flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/5 p-3.5 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={wantsOnboarding}
                onChange={(e) => setWantsOnboarding(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <b className="text-white">Add physical onboarding — +$30</b>
                <br />
                <span className="text-xs text-slate-400">Our team sets it up in person. The in-app self-serve walkthrough is free either way.</span>
              </span>
            </label>
          )}

          <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-slate-500">Pay with</p>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setProvider('paynow')}
              className={`flex items-center justify-center rounded-xl border px-4 py-3 transition-all ${
                provider === 'paynow'
                  ? 'border-green-500 bg-white'
                  : 'border-white/10 bg-white/90 hover:border-white/25'
              }`}
            >
              <img src={paynowBanner} alt="Paynow" className="h-6 w-auto" />
            </button>
            <button
              onClick={() => setProvider('stripe')}
              className={`flex items-center justify-center rounded-xl border px-4 py-3 transition-all ${
                provider === 'stripe'
                  ? 'border-indigo-500 bg-white'
                  : 'border-white/10 bg-white/90 hover:border-white/25'
              }`}
            >
              <img src={stripeBanner} alt="Stripe" className="h-6 w-auto" />
            </button>
            <button
              onClick={() => setProvider('cash')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-bold transition-all ${
                provider === 'cash'
                  ? 'border-amber-500 bg-white text-amber-700'
                  : 'border-white/10 bg-white/90 text-slate-700 hover:border-white/25'
              }`}
            >
              <Banknote className="h-5 w-5" /> Cash
            </button>
          </div>

          <button
            onClick={startCheckout}
            disabled={redirecting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {redirecting
              ? 'Redirecting to secure checkout…'
              : provider === 'cash'
                ? `Request Cash Payment — $${finalPrice(PLANS.find((p) => p.key === selectedPlan)) + (wantsOnboarding && PLANS.find((p) => p.key === selectedPlan)?.onboardingEligible ? 30 : 0)}`
                : `Continue to secure checkout — $${finalPrice(PLANS.find((p) => p.key === selectedPlan)) + (wantsOnboarding && PLANS.find((p) => p.key === selectedPlan)?.onboardingEligible ? 30 : 0)}`}
          </button>

          <p className="mt-3 text-center text-xs text-white">
            {provider === 'cash'
              ? "We'll confirm your payment manually and activate your account — usually within a business day."
              : `You'll be redirected to ${provider === 'stripe' ? 'Stripe' : 'Paynow'}'s secure hosted page. tengaPOS never sees or stores your payment details.`}
          </p>
          </>
          )}

          <p className="mt-6 text-center text-xs text-white">
            Need Business or Enterprise?{' '}
            <a href="mailto:sales@tengapos.co.zw" className="text-brand-400 hover:text-brand-300">Contact sales</a>
          </p>

          <Link to="/" className="mt-4 flex items-center justify-center gap-1.5 text-xs text-white hover:text-slate-300">
            <ArrowLeft className="h-3 w-3" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
