import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight, ShoppingBag, SlidersHorizontal, TrendingUp,
  Monitor, Download, WifiOff, HardDrive, BadgeDollarSign,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { getDownloadInfo } from '@/lib/desktopLicense'
import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import AnnouncementPopup from '@/components/landing/AnnouncementPopup'
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

const desktopPoints = [
  { icon: WifiOff, text: '100% offline — sell for weeks with no connection at all' },
  { icon: HardDrive, text: 'Your data stays on your computer — no hosting fees' },
  { icon: BadgeDollarSign, text: 'Once-off $150 license — no monthly subscription' },
  { icon: Monitor, text: 'Runs on any Windows 10/11 PC or till' },
]

export default function Landing() {
  const [desktopDl, setDesktopDl] = useState(null)
  useEffect(() => {
    getDownloadInfo().then(setDesktopDl).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <AnnouncementPopup />
      <Navbar />
      <Hero />

      {/* Trusted by */}
      <section className="border-y border-slate-100 bg-slate-50 py-8 dark:border-slate-800 dark:bg-slate-900 sm:py-10">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-slate-400 sm:mb-8 sm:text-sm">
            Trusted by businesses of all sizes
          </p>
          <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-8">
            {trustedBy.map((company) => (
              <div
                key={company.name}
                className="flex flex-col items-center gap-1 text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300 sm:flex-row sm:gap-2"
              >
                <span className="text-base sm:text-lg">{company.icon}</span>
                <span className="text-[11px] font-semibold sm:text-sm">{company.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Features />

      {/* Desktop App */}
      <section className="border-y border-slate-100 bg-gradient-to-b from-white to-slate-50 py-24 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-700 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-400">
                <Monitor className="h-3.5 w-3.5" /> New — Desktop App
              </span>
              <h2 className="mt-5 text-4xl font-extrabold text-slate-900 dark:text-white">
                Sell anywhere — even with{' '}
                <span className="bg-gradient-to-r from-brand-500 to-cyan-500 bg-clip-text text-transparent">
                  zero internet
                </span>
              </h2>
              <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
                tengaPOS Desktop puts the entire till on a Windows PC. Sales, inventory,
                receipts and reports live on the machine — it keeps working through
                load-shedding, dead zones and dead Wi-Fi. Syncs nothing it doesn't need to.
              </p>

              <ul className="mt-8 space-y-3">
                {desktopPoints.map((p) => (
                  <li key={p.text} className="flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400">
                      <p.icon className="h-4 w-4" />
                    </span>
                    {p.text}
                  </li>
                ))}
              </ul>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                {desktopDl?.url ? (
                  <Link
                    to="/download"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700"
                  >
                    <Download className="h-4 w-4" />
                    Download for Windows{desktopDl.version ? ` — v${desktopDl.version}` : ''}
                  </Link>
                ) : (
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700"
                  >
                    <Download className="h-4 w-4" />
                    Get the Desktop App
                  </Link>
                )}
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Activate once with a product code · $150 once-off
                </span>
              </div>
            </motion.div>

            {/* Stylized app window */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.15 }}
              className="relative"
            >
              <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand-500/15 via-transparent to-cyan-500/15 blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                  <span className="ml-3 text-xs font-semibold text-slate-400">tengaPOS Desktop — Offline Mode</span>
                  <span className="ml-auto flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                    <WifiOff className="h-3 w-3" /> OFFLINE
                  </span>
                </div>
                <div className="grid grid-cols-[56px_1fr]">
                  <div className="space-y-2 border-r border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
                    {['bg-brand-500', 'bg-slate-300 dark:bg-slate-700', 'bg-slate-300 dark:bg-slate-700', 'bg-slate-300 dark:bg-slate-700'].map((c, i) => (
                      <div key={i} className={`h-8 w-full rounded-lg ${c}`} />
                    ))}
                  </div>
                  <div className="p-4">
                    {[
                      ['Chicken Meal x2', '$12.00'],
                      ['Coca-Cola 500ml x3', '$4.50'],
                      ['Bread x1', '$1.20'],
                    ].map(([n, p]) => (
                      <div key={n} className="flex justify-between border-b border-dashed border-slate-100 py-2 text-xs dark:border-slate-800">
                        <span className="font-medium text-slate-600 dark:text-slate-300">{n}</span>
                        <span className="font-bold text-slate-800 dark:text-white">{p}</span>
                      </div>
                    ))}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Total</span>
                      <span className="text-xl font-extrabold text-slate-900 dark:text-white">$17.70</span>
                    </div>
                    <div className="mt-3 rounded-xl bg-brand-600 py-2.5 text-center text-xs font-bold text-white">
                      Complete Sale — works with no internet
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

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
            </p>

            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-white">
                Talk to Sales
              </button>
            </div>

            <p className="mt-6 text-sm text-slate-500">
              Free setup &amp; onboarding included &nbsp;·&nbsp; 24/7 support
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
