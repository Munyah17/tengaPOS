import { motion } from 'framer-motion'
import { ArrowRight, ShoppingBag, SlidersHorizontal, TrendingUp, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import Features from '@/components/landing/Features'
import Pricing from '@/components/landing/Pricing'
import Footer from '@/components/landing/Footer'

const trustedBy = [
  { name: 'RetailPro', icon: '🛒' },
  { name: 'QuickMart', icon: '🏪' },
  { name: 'ShopHub', icon: '🏬' },
  { name: 'FreshStop', icon: '🥬' },
  { name: 'TechZone', icon: '💻' },
  { name: 'BuildIt', icon: '🔨' },
]

const steps = [
  {
    number: '1',
    icon: ShoppingBag,
    gradient: 'from-brand-500 to-brand-700',
    title: 'Pick your plan',
    description:
      'Choose a hardware bundle or bring your own device. We ship directly to your location, pre-configured and ready to go.',
  },
  {
    number: '2',
    icon: SlidersHorizontal,
    gradient: 'from-purple-500 to-purple-700',
    title: 'We set everything up',
    description:
      'Our team configures your store profile, loads your product catalogue, sets up staff accounts, and runs a training session — no technical skills required.',
  },
  {
    number: '3',
    icon: TrendingUp,
    gradient: 'from-green-500 to-emerald-700',
    title: 'Start selling from day one',
    description:
      'Ring up sales, track stock, manage multiple branches, and watch real-time analytics — online or offline. tengaPOS works wherever business takes you.',
  },
]

const stats = [
  { value: '< 24h', label: 'Average setup time' },
  { value: '100%', label: 'Works offline' },
  { value: '5 min', label: 'First sale onboarding' },
  { value: '24/7', label: 'Support access' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Navbar />
      <Hero />

      {/* Trusted by */}
      <section className="border-y border-slate-100 bg-slate-50 py-10 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-8 text-center text-sm font-semibold uppercase tracking-widest text-slate-400">
            Trusted by businesses of all sizes
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {trustedBy.map((company) => (
              <div
                key={company.name}
                className="flex items-center gap-2 text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300"
              >
                <span className="text-lg">{company.icon}</span>
                <span className="text-sm font-semibold">{company.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Features />

      {/* How it works */}
      <section className="bg-slate-950 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <h2 className="text-4xl font-extrabold text-white">Up and running in minutes</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
              No IT team needed. From order to first sale in three simple steps.
            </p>
          </motion.div>

          <div className="relative mt-16 grid gap-10 lg:grid-cols-3">
            {/* Connector line */}
            <div className="absolute left-1/4 right-1/4 top-10 hidden h-px bg-gradient-to-r from-brand-700 via-purple-700 to-green-700 lg:block" />

            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative text-center"
              >
                <div className="relative inline-block">
                  <div
                    className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${step.gradient} text-white shadow-lg`}
                  >
                    <step.icon className="h-7 w-7" />
                  </div>
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-extrabold text-slate-900 shadow">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-5 text-xl font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.description}</p>
              </motion.div>
            ))}
          </div>

          {/* Stats bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-20 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-800 bg-slate-800 lg:grid-cols-4"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center justify-center bg-slate-900 py-8 text-center"
              >
                <span className="text-3xl font-extrabold text-brand-400">{stat.value}</span>
                <span className="mt-1 text-sm text-slate-500">{stat.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <Pricing />

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-slate-900 to-slate-950 py-24">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/15 blur-[100px]" />

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-sm text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              No credit card required
            </span>

            <h2 className="mt-6 text-4xl font-extrabold text-white sm:text-5xl">
              Ready to transform{' '}
              <span className="bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-transparent">
                your business?
              </span>
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
              Join hundreds of African retailers and restaurants already running on tengaPOS.
              Start free, scale at your pace — cancel any time.
            </p>

            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Start Your Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-white">
                Talk to Sales
              </button>
            </div>

            <p className="mt-6 text-sm text-slate-500">
              Free setup &amp; onboarding included &nbsp;·&nbsp; 24/7 support &nbsp;·&nbsp; Cancel anytime
            </p>
          </motion.div>
        </div>
      </section>

      <Footer />

      {/* WhatsApp floating button */}
      <a
        href="https://wa.me/263773909307"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{ backgroundColor: '#25D366' }}
      >
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </div>
  )
}
