import { motion } from 'framer-motion'
import { Check, Smartphone, Tablet, Monitor, Laptop, Building2 } from 'lucide-react'
import { Link } from 'react-router-dom'

const plans = [
  {
    name: 'Bring Your Own Device',
    price: '$50',
    period: '/ month',
    description: 'Use your own hardware. Full cloud POS access with all core features included.',
    icon: Smartphone,
    iconBg: 'bg-slate-700',
    featured: false,
    badge: null,
    features: [
      'Full POS functionality',
      'Inventory management',
      'Up to 5 staff accounts',
      'Offline-first operation',
      'Cloud sync & backup',
      'Email & chat support',
    ],
    cta: 'Get Started',
    ctaStyle: 'border border-slate-300 text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:text-white dark:hover:bg-slate-800',
  },
  {
    name: 'Standard Plan',
    price: '$200',
    period: 'once-off',
    description: '10″ Android tablet + portable Bluetooth thermal printer + full system access.',
    icon: Tablet,
    iconBg: 'bg-gradient-to-br from-brand-500 to-brand-700',
    featured: true,
    badge: 'Most Popular',
    features: [
      'Everything in BYOD',
      '10″ Android tablet included',
      'Bluetooth thermal printer',
      'Pre-configured out of box',
      'Priority support',
      'Free setup & onboarding',
    ],
    cta: 'Get Started',
    ctaStyle: 'bg-brand-600 text-white hover:bg-brand-700',
    extras: ['6 months free use included', 'Free renewal while using our hardware'],
  },
  {
    name: 'Pro Package',
    price: '$250',
    period: 'once-off',
    description: '12″ Android tablet + Bluetooth portable thermal printer + full system access.',
    icon: Monitor,
    iconBg: 'bg-gradient-to-br from-purple-500 to-purple-700',
    featured: false,
    badge: null,
    features: [
      'Everything in Standard',
      '12″ Android tablet included',
      'Portable Bluetooth printer',
      'Multi-branch ready',
      'Dedicated support line',
      'Hardware warranty included',
    ],
    cta: 'Get Started',
    ctaStyle: 'border border-slate-300 text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:text-white dark:hover:bg-slate-800',
    extras: ['6 months free use included', 'Free renewal while using our hardware'],
  },
]

const turnkeyPackages = [
  {
    name: 'Business Package',
    icon: Laptop,
    iconBg: 'bg-gradient-to-br from-orange-500 to-orange-700',
    description:
      'Windows laptop + Business POS printer machine + Swipe Machine POS terminal + full system access. The complete counter-ready bundle for serious retail operations.',
    features: [
      'Windows laptop',
      'Card swipe / POS terminal machine',
      'Professional installation',
      'Desktop thermal/impact POS printer',
      'Full tengaPOS license',
      'Priority dedicated support line',
    ],
    cta: 'Submit Inquiry for Quote',
    ctaStyle: 'border border-slate-300 text-slate-900 hover:bg-slate-50 dark:border-slate-600 dark:text-white dark:hover:bg-slate-800',
  },
  {
    name: 'Enterprise Package',
    icon: Building2,
    iconBg: 'bg-gradient-to-br from-brand-500 to-brand-700',
    description:
      'Custom solution designed for chain stores, franchises, large retailers, and multi-location businesses. Built to your exact operational requirements.',
    features: [
      'Custom device & hardware configuration',
      'Dedicated cloud infrastructure',
      'White-label branding included',
      'Unlimited branches & locations',
      'Custom integrations & API access',
      'SLA-backed enterprise support',
    ],
    cta: 'Contact Enterprise Sales',
    ctaStyle: 'bg-brand-600 text-white hover:bg-brand-700',
  },
]

export default function Pricing() {
  return (
    <>
      {/* Pricing cards */}
      <section id="pricing" className="bg-white py-24 dark:bg-slate-950">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <span className="text-sm font-semibold uppercase tracking-widest text-brand-600 dark:text-brand-400">
              Pricing
            </span>
            <h2 className="mt-3 text-4xl font-extrabold text-slate-900 dark:text-white">
              Simple, transparent pricing
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-400">
              Choose the package that fits your business. All plans include core POS features.
            </p>

            {/* Pill badges */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-4 py-1.5 text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400">
                <Check className="h-3.5 w-3.5" />
                All packages come with optional ZIMRA Fiscalisation
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                &#x21bb; 6 months free use with every hardware purchase
              </span>
            </div>
          </motion.div>

          <div className="mt-14 grid gap-8 lg:grid-cols-3">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-2xl p-8 ${
                  plan.featured
                    ? 'border-2 border-brand-500 bg-white shadow-2xl shadow-brand-600/10 dark:bg-slate-900'
                    : 'border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1 text-xs font-bold text-white shadow">
                    {plan.badge}
                  </div>
                )}

                <div className={`mb-4 inline-flex rounded-xl ${plan.iconBg} p-3 text-white shadow-lg`}>
                  <plan.icon className="h-5 w-5" />
                </div>

                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold text-slate-900 dark:text-white">{plan.price}</span>
                  <span className="text-slate-500">{plan.period}</span>
                </div>

                {plan.extras && (
                  <div className="mt-3 space-y-1">
                    {plan.extras.map((extra) => (
                      <div
                        key={extra}
                        className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400"
                      >
                        <Check className="h-3 w-3" />
                        {extra}
                      </div>
                    ))}
                  </div>
                )}

                <Link
                  to="/register"
                  className={`mt-6 block w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition-colors ${plan.ctaStyle}`}
                >
                  {plan.cta}
                </Link>

                <ul className="mt-8 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300"
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Complete Turnkey Solutions */}
      <section className="bg-slate-50 py-24 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Complete Turnkey Solutions
            </span>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-2">
            {turnkeyPackages.map((pkg, i) => (
              <motion.div
                key={pkg.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="mb-4 flex items-start gap-4">
                  <div className={`flex-shrink-0 rounded-xl ${pkg.iconBg} p-3 text-white shadow-lg`}>
                    <pkg.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">{pkg.name}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{pkg.description}</p>
                  </div>
                </div>

                <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
                  {pkg.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
                    >
                      <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  className={`mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${pkg.ctaStyle}`}
                >
                  {pkg.cta} &rarr;
                </button>
              </motion.div>
            ))}
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-10 text-center text-sm text-slate-500 dark:text-slate-500"
          >
            Free renewal available as long as you continue using tengaPOS-supplied hardware.{' '}
            <a href="#" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
              Contact us to learn more.
            </a>
          </motion.p>
        </div>
      </section>
    </>
  )
}
