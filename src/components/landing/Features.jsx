import { motion } from 'framer-motion'
import {
  ShoppingCart, ChefHat, WifiOff, BarChart3, Shield,
  Users, Package, Receipt, Globe, Smartphone,
} from 'lucide-react'

const features = [
  {
    icon: ShoppingCart,
    title: 'Retail POS',
    description: 'Full-featured point of sale for supermarkets, boutiques, pharmacies, and hardware stores.',
    gradient: 'from-brand-500 to-blue-500',
  },
  {
    icon: ChefHat,
    title: 'Restaurant POS',
    description: 'Kitchen order queues, table management, order tracking, and gratuity support.',
    gradient: 'from-restaurant-500 to-emerald-500',
  },
  {
    icon: WifiOff,
    title: 'Offline-First',
    description: 'Full operation without internet. Auto-sync when connectivity returns. Never lose a sale.',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    icon: Package,
    title: 'Inventory Management',
    description: 'SKU & barcode tracking, stock alerts, branch transfers, CSV/Excel imports, and purchase orders.',
    gradient: 'from-orange-500 to-amber-500',
  },
  {
    icon: BarChart3,
    title: 'Real-Time Analytics',
    description: 'Sales dashboards, revenue charts, top products, dead stock alerts, and branch performance.',
    gradient: 'from-cyan-500 to-teal-500',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    description: 'Row-level security, strict tenant isolation, JWT auth, and comprehensive audit logs.',
    gradient: 'from-red-500 to-rose-500',
  },
  {
    icon: Users,
    title: 'Multi-Branch Support',
    description: 'Manage multiple locations from one dashboard. Branch-specific inventory and staff management.',
    gradient: 'from-indigo-500 to-violet-500',
  },
  {
    icon: Receipt,
    title: 'ZIMRA Fiscalisation',
    description: 'Optional fiscal compliance add-on with automatic tax calculation and fiscal QR codes.',
    gradient: 'from-emerald-500 to-green-500',
  },
  {
    icon: Globe,
    title: 'White Label Ready',
    description: 'Custom branding with tenant subdomains. Your brand, our infrastructure.',
    gradient: 'from-pink-500 to-fuchsia-500',
  },
  {
    icon: Smartphone,
    title: 'PWA Architecture',
    description: 'Installable web app with cached assets, app-shell startup, and persistent storage.',
    gradient: 'from-yellow-500 to-orange-500',
  },
]

export default function Features() {
  return (
    <section id="features" className="relative bg-white py-24 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <span className="text-sm font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
            Features
          </span>
          <h2 className="mt-3 text-4xl font-extrabold text-slate-900 dark:text-white">
            Everything you need to run your business
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-400">
            From point of sale to inventory, analytics to compliance — tengaPOS is the
            complete operating system for African retail and restaurant businesses.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -4 }}
              className="group rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
            >
              <div
                className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${feature.gradient} p-3 text-white shadow-lg`}
              >
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 font-bold text-slate-900 dark:text-white">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
