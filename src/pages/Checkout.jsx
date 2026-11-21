import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckCircle, ShieldCheck, Loader2, ArrowLeft, Banknote, Landmark, Smartphone, Copy, MessageCircle,
} from 'lucide-react'
import posIcon from '@/assets/pos-icon.png'
import paynowBanner from '@/assets/paynow-banner.png'
import stripeBanner from '@/assets/stripe-banner.png'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { usePlanPricing, useManualPaymentDetails } from '@/lib/platformSettings'
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

const BANNER_PROVIDERS = [
  { key: 'paynow', label: 'Paynow', banner: paynowBanner, ring: 'ring-sky-400' },
  { key: 'stripe', label: 'Stripe', banner: stripeBanner, ring: 'ring-indigo-400' },
]

const MANUAL_METHODS = [
  { key: 'bank_transfer', label: 'Bank transfer', icon: Landmark },
  { key: 'mobile_transfer', label: 'EcoCash / InnBucks', icon: Smartphone },
  { key: 'cash', label: 'Cash', icon: Banknote },
]

function PayWithSelector({ provider, onChange, methods = [], className = '' }) {
  const manual = MANUAL_METHODS.filter((m) => methods.includes(m.key))
  return (
    <div className={className}>
      <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-slate-500">Pay with</p>
      <div className="space-y-3">
        {BANNER_PROVIDERS.map(({ key, label, banner, ring }) => {
          const selected = provider === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-pressed={selected}
              aria-label={`Pay with ${label}`}
              className={`relative block w-full rounded-2xl bg-white px-4 py-3 transition-all ${
                selected ? `ring-4 ${ring}` : 'opacity-80 ring-1 ring-white/10 hover:opacity-100'
              }`}
            >
              <img src={banner} alt="" className="mx-auto h-auto w-full max-w-md" />
              {selected && (
                <CheckCircle className="absolute right-2 top-2 h-5 w-5 rounded-full bg-white text-green-600" />
              )}
            </button>
          )
        })}
        {manual.length > 0 && (
          <div className={`grid gap-3 ${manual.length === 1 ? 'grid-cols-1' : manual.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
            {manual.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                aria-pressed={provider === key}
                className={`flex items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-sm font-semibold transition-all ${
                  provider === key
                    ? 'text-slate-900 ring-4 ring-amber-400'
                    : 'text-slate-700 opacity-80 ring-1 ring-white/10 hover:opacity-100'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const money = (n) => `$${Number(n).toFixed(2)}`

function CopyValue({ value }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value).replace(/\s+/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { toast.error('Could not copy — please type it in') }
  }
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-medium text-brand-300 hover:text-brand-200">
      {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

const fieldClass = 'mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none'

// Pay-to details and the proof fields for a direct bank or mobile-money
// transfer. The money moves outside the app, so the customer quotes the
// reference from their receipt and platform staff match it by hand.
function TransferPanel({ method, details, lines, total, payerReference, onReference, payerName, onName, popUrl }) {
  const isBank = method === 'bank_transfer'
  const rows = isBank
    ? [
        ['Account name', details.bank.accountName],
        ['Bank', details.bank.bankName],
        ...(details.bank.branch ? [['Branch', details.bank.branch]] : []),
        ['USD account', details.bank.accountNumber, true],
      ]
    : [
        ['Number', details.mobile.number, true],
        ['Name', details.mobile.name],
      ]
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left sm:p-5">
      <dl className="space-y-1.5 border-b border-white/10 pb-3 text-sm">
        {lines.map(([label, amount]) => (
          <div key={label} className="flex justify-between gap-4 text-slate-300">
            <dt>{label}</dt>
            <dd className="tabular-nums">{money(amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 font-semibold text-white">
          <dt>Total</dt>
          <dd className="tabular-nums">{money(total)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-sm font-semibold text-white">
        {isBank ? `Transfer ${money(total)} to:` : `Send ${money(total)} via EcoCash or InnBucks to:`}
      </p>
      <dl className="mt-2 divide-y divide-white/10 text-sm">
        {rows.map(([label, value, copyable]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-slate-400">{label}</dt>
            <dd className="flex items-center gap-3 text-right font-medium text-white">
              <span className="break-all">{value}</span>
              {copyable && <CopyValue value={value} />}
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 py-2">
          <dt className="text-slate-400">Amount</dt>
          <dd className="font-medium tabular-nums text-white">{money(total)}</dd>
        </div>
      </dl>

      <label className="mt-4 block text-sm font-medium text-slate-200">
        Transaction reference <span className="text-red-400">*</span>
        <input
          value={payerReference}
          onChange={(e) => onReference(e.target.value)}
          maxLength={80}
          placeholder="Transaction ID"
          className={fieldClass}
        />
        <span className="mt-1 block text-xs font-normal text-slate-400">
          e.g. the EcoCash / bank transaction ID from your receipt
        </span>
      </label>
      {!isBank && (
        <label className="mt-3 block text-sm font-medium text-slate-200">
          Sender name (EcoCash / InnBucks) <span className="text-red-400">*</span>
          <input
            value={payerName}
            onChange={(e) => onName(e.target.value)}
            maxLength={120}
            placeholder="Sender name"
            className={fieldClass}
          />
          <span className="mt-1 block text-xs font-normal text-slate-400">
            Name of the person, agent or organisation that sent the money. Must match the sender name shown on the
            mobile money transfer.
          </span>
        </label>
      )}

      {popUrl && (
        <>
          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            After paying, send your proof of payment on WhatsApp to {details.popWhatsapp} with your name, email, phone
            and transaction reference — we'll activate your account as soon as it's confirmed.
          </p>
          <a
            href={popUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-green-500/40 py-2.5 text-sm font-semibold text-green-300 transition-colors hover:bg-green-500/10"
          >
            <MessageCircle className="h-4 w-4" /> Send PoP on WhatsApp
          </a>
        </>
      )}
    </div>
  )
}

export default function Checkout() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { isAuthenticated, tenant, profile, initAuth } = useAuthStore()
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
  const manualDetails = useManualPaymentDetails()
  const [payerReference, setPayerReference] = useState('')
  const [payerName, setPayerName] = useState('')
  const isTransfer = provider === 'bank_transfer' || provider === 'mobile_transfer'
  const manualMethods = [
    ...(manualDetails.bankReady ? ['bank_transfer'] : []),
    ...(manualDetails.mobileReady ? ['mobile_transfer'] : []),
    'cash',
  ]

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

  const chosenPlan = PLANS.find((p) => p.key === selectedPlan)
  const onboardingFee = wantsOnboarding && chosenPlan?.onboardingEligible ? 30 : 0
  const planTotal = finalPrice(chosenPlan) + onboardingFee
  const popDigits = manualDetails.popWhatsapp.replace(/\D/g, '')
  const popUrl = popDigits
    ? `https://wa.me/${popDigits}?text=${encodeURIComponent(
        [
          'Proof of payment for tengaPOS',
          `Business: ${tenant?.name || ''}`,
          `Email: ${profile?.email || ''}`,
          `Plan: ${chosenPlan.name}`,
          `Amount: ${money(planTotal)}`,
          `Transaction reference: ${payerReference.trim()}`,
        ].join('\n'),
      )}`
    : ''

  const startCheckout = async () => {
    if (isTransfer && !payerReference.trim()) { toast.error('Enter the transaction reference from your receipt'); return }
    if (provider === 'mobile_transfer' && !payerName.trim()) { toast.error('Enter the sender name shown on the transfer'); return }
    setRedirecting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const body = hostingLapsed
        ? { type: 'hosting', period: hostingPeriod, provider, return_url: `${window.location.origin}/checkout` }
        : {
            plan_type: selectedPlan,
            provider,
            onboarding: wantsOnboarding,
            ...(isTransfer ? { payer_reference: payerReference.trim(), payer_name: payerName.trim() } : {}),
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

              <PayWithSelector provider={provider} onChange={setProvider} className="mt-6" />

              <button
                onClick={startCheckout}
                disabled={redirecting}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {redirecting ? 'Redirecting…' : `Continue to secure checkout — $${hostingAmount}`}
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
                We'll activate your account as soon as your {isTransfer ? 'transfer' : 'cash payment'} is confirmed.
                {isTransfer && popUrl ? ' Send your proof of payment on WhatsApp to speed this up.' : ' No further action needed here.'}
              </p>
              {isTransfer && popUrl && (
                <a
                  href={popUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
                >
                  <MessageCircle className="h-4 w-4" /> Send PoP on WhatsApp
                </a>
              )}
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

          <PayWithSelector provider={provider} onChange={setProvider} methods={manualMethods} />

          {isTransfer && (
            <TransferPanel
              method={provider}
              details={manualDetails}
              lines={[
                [chosenPlan.name, finalPrice(chosenPlan)],
                ...(onboardingFee ? [['Physical onboarding', onboardingFee]] : []),
              ]}
              total={planTotal}
              payerReference={payerReference}
              onReference={setPayerReference}
              payerName={payerName}
              onName={setPayerName}
              popUrl={popUrl}
            />
          )}

          <button
            onClick={startCheckout}
            disabled={redirecting}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
          >
            {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {redirecting
              ? (isTransfer || provider === 'cash' ? 'Submitting…' : 'Redirecting to secure checkout…')
              : isTransfer
                ? `I've sent ${money(planTotal)} — continue`
                : provider === 'cash'
                  ? `Request Cash Payment — $${planTotal}`
                  : `Continue to secure checkout — $${planTotal}`}
          </button>

          <p className="mt-3 text-center text-xs text-white">
            {isTransfer || provider === 'cash'
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
