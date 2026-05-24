import { motion } from 'framer-motion'
import { Check, Zap, Building2, Shield } from 'lucide-react'
import Button from '@/components/common/Button'

const plans = [
  {
    name: 'Hardware + System',
    price: 'FREE',
    period: 'for 6 months',
    renewal: '$10 / 6 months renewal',
    description: 'Get started with official tengaPOS hardware and enjoy 6 months free access.',
    icon: Zap,
    features: [
      'Full POS functionality',
      'Inventory management',
      'Up to 3 staff accounts',
      'Offline-first operation',
      'Cloud sync & backup',
      'Email support',
    ],
    featured: false,
    gradient: 'from-slate-600 to-slate-800',
  },
  {
    name: 'Software Only',
    price: '$50',
    period: '/ month',
    renewal: null,
    description: 'Full cloud POS without official hardware. Use your own devices.',
    icon: Building2,
    features: [
      'Everything in Hardware plan',
      'Unlimited staff accounts',
      'Multi-branch support',
      'Advanced analytics',
      'Priority support',
      'CSV/Excel imports',
      'Purchase orders',
      'Task management',
    ],
    featured: true,
    gradient: 'from-brand-600 to-blue-600',
  },
  {
    name: 'Add-Ons',
    price: 'Custom',
    period: '',
    renewal: null,
    description: 'Extend with compliance and branding options.',
    icon: Shield,
    features: [
      'ZIMRA Fiscalisation — $20/device/mo',
      'Fiscal QR codes & receipts',
      'ZIMRA API integration',
      'White Label — $50 once-off',
      'Custom subdomain',
      'Custom branding',
    ],
    featured: false,
    gradient: 'from-purple-600 to-pink-600',
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="relative bg-slate-50 py-24 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
            Pricing
          </span>
          <h2 className="mt-3 text-4xl font-extrabold text-slate-900 dark:text-white">
            Simple, transparent pricing
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-400">
            Start free with our hardware combo, or go software-only for full flexibility.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`relative rounded-2xl p-8 ${
                plan.featured
                  ? 'border-2 border-brand-500 bg-white shadow-2xl shadow-brand-600/10 dark:bg-slate-800'
                  : 'border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1 text-xs font-bold text-white">
                  Most Popular
                </div>
              )}
              <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${plan.gradient} p-3 text-white`}>
                <plan.icon className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{plan.description}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
                  {plan.price}
                </span>
                <span className="text-slate-500">{plan.period}</span>
              </div>
              {plan.renewal && (
                <p className="mt-1 text-sm text-slate-500">{plan.renewal}</p>
              )}
              <Button
                variant={plan.featured ? 'primary' : 'secondary'}
                className="mt-6 w-full"
              >
                Get Started
              </Button>
              <ul className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
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
  )
}
