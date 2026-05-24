import { motion } from 'framer-motion'
import { ArrowRight, Play, Zap } from 'lucide-react'
import Button from '@/components/common/Button'

export default function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-brand-950 pt-32 pb-20">
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Glow effects */}
      <div className="absolute top-1/4 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-brand-600/10 blur-[128px]" />
      <div className="absolute top-1/3 right-1/4 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-400"
          >
            <Zap className="h-3.5 w-3.5" />
            Built for African SMEs
          </motion.div>

          {/* Heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto max-w-5xl text-5xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl md:text-7xl"
          >
            The Cloud Operating System for{' '}
            <span className="bg-gradient-to-r from-brand-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Retail & Restaurants
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-slate-400"
          >
            Enterprise-grade POS and inventory management that works offline.
            Run your business from anywhere — supermarkets, boutiques, pharmacies,
            restaurants, and more.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          >
            <Button size="xl" className="w-full sm:w-auto">
              Get Started Free <ArrowRight className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="xl" className="w-full text-slate-300 hover:text-white sm:w-auto">
              <Play className="h-5 w-5" /> Watch Demo
            </Button>
          </motion.div>

          {/* Trust */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-8 text-sm text-slate-500"
          >
            6 months FREE with hardware purchase • No credit card required • Offline-first
          </motion.p>
        </div>

        {/* Dashboard Preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto mt-20 max-w-5xl"
        >
          <div className="relative rounded-2xl border border-white/10 bg-white/5 p-2 shadow-2xl shadow-brand-600/10 backdrop-blur-sm">
            <div className="overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 to-slate-800">
              {/* Mock dashboard */}
              <div className="flex h-[400px] sm:h-[500px]">
                {/* Sidebar */}
                <div className="hidden w-56 border-r border-slate-700/50 p-4 sm:block">
                  <div className="mb-6 flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-brand-600" />
                    <span className="font-bold text-white">tengaPOS</span>
                  </div>
                  {['Dashboard', 'POS', 'Inventory', 'Orders', 'Reports', 'Settings'].map(
                    (item, i) => (
                      <div
                        key={item}
                        className={`mb-1 rounded-lg px-3 py-2 text-sm ${
                          i === 0
                            ? 'bg-brand-600/20 font-medium text-brand-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {item}
                      </div>
                    )
                  )}
                </div>
                {/* Main area */}
                <div className="flex-1 p-6">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <div className="h-3 w-24 rounded bg-slate-700" />
                      <div className="mt-2 h-5 w-40 rounded bg-slate-700" />
                    </div>
                    <div className="h-8 w-24 rounded-lg bg-brand-600/30" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {[
                      { label: 'Revenue', value: '$12,450', color: 'from-brand-600 to-blue-600' },
                      { label: 'Orders', value: '284', color: 'from-green-600 to-emerald-600' },
                      { label: 'Products', value: '1,432', color: 'from-purple-600 to-pink-600' },
                      { label: 'Customers', value: '893', color: 'from-orange-600 to-amber-600' },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4"
                      >
                        <div className="text-xs text-slate-500">{card.label}</div>
                        <div className={`mt-1 bg-gradient-to-r ${card.color} bg-clip-text text-xl font-bold text-transparent`}>
                          {card.value}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Chart placeholder */}
                  <div className="mt-4 flex h-40 items-end gap-1.5 rounded-xl border border-slate-700/50 bg-slate-800/50 p-4">
                    {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ delay: 0.6 + i * 0.05, duration: 0.5 }}
                        className="flex-1 rounded-t-sm bg-gradient-to-t from-brand-600 to-brand-400 opacity-80"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
