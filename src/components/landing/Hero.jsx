import { motion } from 'framer-motion'
import { ArrowRight, Play, Star, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import heroImage from '@/assets/pos-hero.png'

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
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
              >
                <Play className="h-4 w-4 fill-current" />
                Live Demo
              </Link>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-6 flex flex-wrap gap-4"
            >
              {['Works 100% Offline', 'Setup in Under 24h', '24/7 Support'].map((badge) => (
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

          {/* RIGHT — hero image */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative flex items-center justify-center"
          >
            <div className="absolute -inset-8 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
            <img
              src={heroImage}
              alt="tengaPOS running on laptop, phone and printer"
              className="relative w-full max-w-xl drop-shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
            />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
