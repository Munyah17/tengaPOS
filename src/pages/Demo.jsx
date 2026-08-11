import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Store, UserCog, ShoppingBag, Users2, ArrowRight, Sparkles } from 'lucide-react'
import posIcon from '@/assets/pos-icon.png'
import { enterDemoMode, firstAllowedDemoPath } from '@/lib/demoAuth'
import { DEMO_USERS } from '@/lib/demoData'

const ROLE_CARDS = [
  {
    role: 'vendor', icon: ShieldCheck, accent: 'from-brand-500 to-brand-700',
    title: 'Vendor (Owner)', desc: 'Full access — dashboard, reports, staff, everything.',
  },
  {
    role: 'shop_manager', icon: Store, accent: 'from-purple-500 to-purple-700',
    title: 'Shop Manager', desc: 'Runs day-to-day operations across the shop.',
  },
  {
    role: 'supervisor', icon: UserCog, accent: 'from-orange-500 to-orange-700',
    title: 'Supervisor', desc: 'Oversees the floor — sales, stock, approvals.',
  },
  {
    role: 'cashier', icon: ShoppingBag, accent: 'from-green-500 to-green-700',
    title: 'Cashier', desc: 'Till-focused — POS, orders, and their own numbers.',
  },
  {
    role: 'shop_assistant', icon: Users2, accent: 'from-slate-500 to-slate-700',
    title: 'Shop Assistant', desc: 'Front-of-house — POS and daily tasks.',
  },
]

export default function Demo() {
  const navigate = useNavigate()

  const start = (role) => {
    enterDemoMode(role)
    navigate(firstAllowedDemoPath(role), { replace: true })
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#040c1a]">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.04)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute left-1/4 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-600/15 blur-[120px]" />

      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16">
        <motion.img
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          src={posIcon}
          alt="tengaPOS"
          className="mb-6 h-14 w-14"
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-300"
        >
          <Sparkles className="h-3.5 w-3.5 fill-current" />
          Live Demo — sample data, nothing is saved
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-center text-3xl font-extrabold text-white sm:text-4xl"
        >
          Explore tengaPOS as your team would
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-3 max-w-xl text-center text-slate-400"
        >
          Pick a role below to jump straight into a fully-populated sandbox store —
          real products, real sales history, real screens. Click around freely; you can
          switch roles anytime from the top bar, and nothing you do here touches a real database.
        </motion.p>

        <div className="mt-10 grid w-full gap-4 sm:grid-cols-2">
          {ROLE_CARDS.map((card, i) => {
            const Icon = card.icon
            const user = DEMO_USERS[card.role]
            return (
              <motion.button
                key={card.role}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.05 }}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => start(card.role)}
                className="group flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left transition-colors hover:border-brand-500/40 hover:bg-slate-900"
              >
                <div className={`flex-shrink-0 rounded-xl bg-gradient-to-br ${card.accent} p-3 text-white shadow-lg`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white">{card.title}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{card.desc}</p>
                  <p className="mt-1 text-xs text-slate-600">{user?.name}</p>
                </div>
                <ArrowRight className="h-5 w-5 flex-shrink-0 text-slate-600 transition-colors group-hover:text-brand-400" />
              </motion.button>
            )
          })}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-10 text-center text-sm text-slate-500"
        >
          Ready to run this for real?{' '}
          <a href="/register" className="font-medium text-brand-400 hover:text-brand-300">
            Create your account
          </a>
        </motion.p>
      </div>
    </div>
  )
}
