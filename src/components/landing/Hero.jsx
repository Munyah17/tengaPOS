import { motion } from 'framer-motion'
import { ArrowRight, Play, Star, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'

function DeviceMockup() {
  return (
    <div className="relative w-full">
      <div className="absolute -inset-8 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />

      {/* Laptop / main screen */}
      <div className="relative z-0 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl shadow-black/60">
        {/* Screen header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-[8px] font-extrabold text-white">
              tP
            </div>
            <span className="text-xs font-bold text-white">tengaPOS</span>
          </div>
          <div className="text-[9px] text-slate-500">Welcome back, Tatenda ✓</div>
        </div>

        {/* Screen body */}
        <div className="flex" style={{ height: '260px' }}>
          {/* Mini sidebar */}
          <div className="w-24 flex-shrink-0 space-y-0.5 border-r border-slate-800 bg-slate-950 p-2">
            {['Dashboard', 'POS', 'Inventory', 'Orders', 'Reports'].map((item, i) => (
              <div
                key={item}
                className={`rounded-md px-2 py-1.5 text-[8px] font-medium ${
                  i === 0 ? 'bg-brand-600/20 text-brand-400' : 'text-slate-600'
                }`}
              >
                {item}
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 bg-[#060d1a] p-3">
            {/* Stat cards */}
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {[
                { l: 'Revenue', v: '$4,950', c: 'from-brand-500 to-brand-700' },
                { l: 'Orders', v: '129', c: 'from-green-500 to-green-700' },
                { l: 'Customers', v: '86', c: 'from-purple-500 to-purple-700' },
                { l: 'Grand Total', v: '$1,230', c: 'from-orange-500 to-orange-700' },
              ].map((card) => (
                <div
                  key={card.l}
                  className="rounded-lg border border-slate-800/50 bg-slate-900/80 p-2"
                >
                  <div className="text-[6px] text-slate-500">{card.l}</div>
                  <div
                    className={`mt-0.5 bg-gradient-to-r ${card.c} bg-clip-text text-[9px] font-bold text-transparent`}
                  >
                    {card.v}
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue chart */}
            <div className="mb-2 rounded-lg border border-slate-800/50 bg-slate-900/80 p-2">
              <div className="mb-1 text-[7px] text-slate-500">Revenue This Week</div>
              <div className="flex items-end gap-0.5" style={{ height: '50px' }}>
                {[35, 55, 45, 70, 58, 85, 72, 90, 65, 80, 88, 75].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-gradient-to-t from-brand-600 to-brand-400 opacity-80"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Product list */}
            <div className="rounded-lg border border-slate-800/50 bg-slate-900/80 p-2">
              <div className="mb-1 text-[7px] text-slate-500">Top Products</div>
              <div className="space-y-0.5">
                {[
                  { n: 'Coca-Cola 500ml', v: '$217', sold: '145 sold' },
                  { n: 'Bread — White Loaf', v: '$144', sold: '120 sold' },
                  { n: 'Fresh Milk 1L', v: '$245', sold: '98 sold' },
                ].map((p) => (
                  <div key={p.n} className="flex items-center justify-between text-[7px]">
                    <span className="text-slate-400">{p.n}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600">{p.sold}</span>
                      <span className="font-medium text-white">{p.v}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phone overlay */}
      <div className="absolute -bottom-6 -left-8 z-10 w-28 overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-2 py-1.5">
          <span className="text-[7px] font-bold text-white">tengaPOS</span>
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
        </div>
        <div className="p-2.5">
          <div className="text-[7px] text-slate-500">Today&apos;s Sales</div>
          <div className="text-base font-bold text-white">$4,350</div>
          <div className="my-1.5 flex items-end gap-0.5" style={{ height: '32px' }}>
            {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-brand-500 opacity-80"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="space-y-0.5">
            {['Coca-Cola', 'Bread Loaf', 'Milk 1L'].map((item) => (
              <div key={item} className="flex items-center gap-1 text-[6px] text-slate-400">
                <div className="h-1 w-1 rounded-full bg-brand-500" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto my-1 h-0.5 w-8 rounded-full bg-slate-700" />
      </div>

      {/* Printer overlay */}
      <div className="absolute -bottom-4 right-0 z-10 w-32">
        <div className="rounded-xl border border-slate-600/50 bg-slate-800 p-3 shadow-xl shadow-black/50">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[8px] font-bold text-white">tengaPOS</span>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500 shadow-sm shadow-green-400/60" />
              <span className="text-[6px] text-slate-500">Ready</span>
            </div>
          </div>
          <div className="h-px w-full bg-slate-700" />
          <div className="mt-2 rounded bg-slate-700/50 p-1.5">
            <div className="space-y-0.5">
              {[1, 0.5, 1, 0.7, 1, 0.4, 1].map((w, i) => (
                <div
                  key={i}
                  className="h-px rounded bg-white/25"
                  style={{ width: `${w * 100}%` }}
                />
              ))}
            </div>
          </div>
          <div className="mt-2 flex justify-center">
            <div className="flex h-3 w-14 items-center justify-center rounded-sm border border-slate-500 bg-slate-600">
              <div className="h-0.5 w-10 rounded bg-white/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-[#040c1a] pt-20">
      {/* Grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.04)_1px,transparent_1px)] bg-[size:64px_64px]" />
      {/* Radial glow */}
      <div className="absolute left-1/4 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-600/15 blur-[120px]" />
      <div className="absolute right-1/4 top-1/2 h-64 w-64 rounded-full bg-purple-600/10 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* LEFT — text */}
          <div>
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-300"
            >
              <Star className="h-3.5 w-3.5 fill-current" />
              All-in-One POS &amp; Inventory Platform
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              Run Your Business Smarter. Sell{' '}
              <span className="bg-gradient-to-r from-brand-400 to-cyan-400 bg-clip-text text-transparent">
                Anywhere.
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-6 text-lg leading-relaxed text-slate-400"
            >
              tengaPOS helps you manage sales, inventory, customers and reports in
              real-time across all your devices. Simple, powerful, and built to grow
              with your business.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 flex flex-col gap-4 sm:flex-row"
            >
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-[#040c1a]"
              >
                Start Your Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-white">
                <Play className="h-4 w-4 fill-current" />
                Watch Demo
              </button>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-6 flex flex-wrap gap-4"
            >
              {['Work On The Go', 'No Credit Card', 'Cancel Anytime'].map((badge) => (
                <div
                  key={badge}
                  className="flex items-center gap-1.5 text-sm text-slate-500"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  {badge}
                </div>
              ))}
            </motion.div>
          </div>

          {/* RIGHT — device mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative pb-12 pr-4 pt-4"
          >
            <DeviceMockup />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
