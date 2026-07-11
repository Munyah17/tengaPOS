import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CreditCard, Smartphone, CheckCircle, Clock, ArrowRight,
  Sparkles, ShieldCheck, Loader2, ArrowLeft,
} from 'lucide-react'
import posIcon from '@/assets/pos-icon.png'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

const PLANS = [
  {
    key: 'byod_monthly',
    name: 'BYOD Monthly',
    price: 50,
    cycle: 'per month',
    desc: 'Use your own device',
    features: ['POS & Inventory', 'Transactions & Reports', 'Task manager', '1 branch · 3 users'],
  },
  {
    key: 'standard_plan',
    name: 'Standard Plan',
    price: 200,
    cycle: 'once-off · 6 months included',
    renewal: 'Free renewal — Ts & Cs apply',
    desc: 'Combo hardware bundle',
    popular: true,
    features: ['Everything in BYOD', 'Kitchen display & Orders', 'ZIMRA Fiscalisation', 'Staff management · 5 users'],
  },
  {
    key: 'pro_package',
    name: 'Pro Package',
    price: 250,
    cycle: 'once-off · 6 months included',
    renewal: 'Free renewal — Ts & Cs apply',
    desc: 'Full restaurant & retail suite',
    features: ['Everything in Standard', 'Dining board & Drive-through', 'Advanced reports', '3 branches · 10 users'],
  },
]

function daysLeft(iso) {
  return Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86400000))
}

export default function Checkout() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { isAuthenticated, tenant, initAuth, isDemo } = useAuthStore()
  const [selectedPlan, setSelectedPlan] = useState('standard_plan')
  const [provider, setProvider] = useState('paynow')
  const [redirecting, setRedirecting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const returnStatus = params.get('status')
  const returnRef = params.get('ref')

  const trialActive = tenant?.trial_ends_at && !tenant?.plan_start_date && new Date(tenant.trial_ends_at) > new Date()
  const trialExpired = tenant?.trial_ends_at && !tenant?.plan_start_date && new Date(tenant.trial_ends_at) <= new Date()
  const hasPaidPlan = !!tenant?.plan_start_date
  // Trial is opt-in and once per business
  const trialAvailable = !tenant?.trial_ends_at && !hasPaidPlan
  const [startingTrial, setStartingTrial] = useState(false)

  const startTrial = async () => {
    setStartingTrial(true)
    try {
      const { data, error } = await supabase.rpc('start_free_trial')
      if (error) throw error
      if (data?.ok === false) throw new Error('Could not start trial')
      await initAuth()
      toast.success('Your 7-day free trial is live — $0 due today!')
      navigate('/app/dashboard')
    } catch (err) {
      toast.error(err.message || 'Could not start the free trial')
      setStartingTrial(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) navigate('/login')
    if (isDemo) navigate('/app/dashboard')
  }, [isAuthenticated, isDemo, navigate])

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
      const { data, error } = await supabase.functions.invoke('signup-checkout', {
        body: {
          plan_type: selectedPlan,
          provider,
          return_url: `${window.location.origin}/checkout`,
        },
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <img src={posIcon} alt="tengaPOS" className="mx-auto mb-4 h-12 w-auto" />
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Choose your plan</h1>
          {trialActive ? (
            <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3">
              <Sparkles className="h-5 w-5 flex-shrink-0 text-green-400" />
              <p className="text-sm text-green-300">
                <b>Your 7-day free trial is active</b> — {daysLeft(tenant.trial_ends_at)} day{daysLeft(tenant.trial_ends_at) !== 1 ? 's' : ''} left.
                Due today: <b>$0!</b>
              </p>
            </div>
          ) : trialExpired ? (
            <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <Clock className="h-5 w-5 flex-shrink-0 text-amber-400" />
              <p className="text-sm text-amber-300">
                <b>Your free trial has ended.</b> Pick a plan below to keep using tengaPOS — your data is safe.
              </p>
            </div>
          ) : hasPaidPlan ? (
            <p className="mt-2 text-sm text-slate-400">Manage or change your subscription</p>
          ) : (
            <p className="mt-2 text-sm text-slate-400">Secure checkout — powered by Stripe & Paynow</p>
          )}
        </div>

        {/* 7-Day Free Trial — its own pricing option */}
        {trialAvailable && (
          <div className="mx-auto mb-6 max-w-2xl rounded-2xl border-2 border-green-500/70 bg-green-500/10 p-5 sm:p-6">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
              <div className="text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <Sparkles className="h-5 w-5 text-green-400" />
                  <h2 className="text-lg font-extrabold text-white">7-Day Free Trial</h2>
                  <span className="rounded-full bg-green-500 px-3 py-0.5 text-xs font-bold text-white">
                    Due today — $0!
                  </span>
                </div>
                <p className="mt-1 text-sm text-green-200/80">
                  Full vendor dashboard access for 7 days. No card needed. One trial per business.
                </p>
              </div>
              <button
                onClick={startTrial}
                disabled={startingTrial}
                className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-60"
              >
                {startingTrial ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {startingTrial ? 'Starting…' : 'Start Free Trial'}
              </button>
            </div>
          </div>
        )}

        {/* Plans */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <p className="mt-3 text-3xl font-extrabold text-white">${plan.price}</p>
              <p className="text-xs text-slate-500">{plan.cycle}</p>
              {plan.renewal && (
                <p className="mt-0.5 text-xs font-semibold text-green-400">{plan.renewal}</p>
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
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-slate-500">Pay with</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setProvider('paynow')}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                provider === 'paynow'
                  ? 'border-green-500 bg-green-500/10 text-green-300'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/25'
              }`}
            >
              <Smartphone className="h-4 w-4" />
              Paynow · EcoCash
            </button>
            <button
              onClick={() => setProvider('stripe')}
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                provider === 'stripe'
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/25'
              }`}
            >
              <CreditCard className="h-4 w-4" />
              Card · Stripe
            </button>
          </div>

          <button
            onClick={startCheckout}
            disabled={redirecting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {redirecting ? 'Redirecting to secure checkout…' : `Continue to secure checkout — $${PLANS.find((p) => p.key === selectedPlan)?.price}`}
          </button>

          <p className="mt-3 text-center text-xs text-slate-500">
            You'll be redirected to {provider === 'stripe' ? 'Stripe' : 'Paynow'}'s secure hosted page.
            tengaPOS never sees or stores your payment details.
          </p>

          {trialActive && (
            <button
              onClick={() => navigate('/app/dashboard')}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5"
            >
              Continue free trial — $0 due today
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          <p className="mt-6 text-center text-xs text-slate-500">
            Need Business or Enterprise?{' '}
            <a href="mailto:sales@tengapos.co.zw" className="text-brand-400 hover:text-brand-300">Contact sales</a>
          </p>

          <Link to="/" className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300">
            <ArrowLeft className="h-3 w-3" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
