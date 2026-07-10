import { Check, X } from 'lucide-react'
import { PLANS, DEFAULT_FEATURES } from '@/pages/admin/AdminTenants'

const FEATURE_LABELS = [
  { key: 'pos', label: 'POS / Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'staff', label: 'Staff Management' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'kitchen', label: 'Kitchen Display' },
  { key: 'orders', label: 'Orders Board' },
  { key: 'dining_board', label: 'Dining Board' },
  { key: 'drive_through', label: 'Drive-Through' },
  { key: 'fiscalisation', label: 'ZIMRA Fiscalisation' },
  { key: 'api_access', label: 'API Access' },
]

export default function SuperAdminPricing() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Pricing Tiers</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Plan defaults applied when a tenant is approved. Per-tenant overrides are set on the tenant record.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(PLANS).map(([key, plan]) => {
          const Icon = plan.icon
          const features = DEFAULT_FEATURES[key]
          return (
            <div key={key} className={`rounded-2xl border p-5 ${plan.border} ${plan.bg}`}>
              <div className="flex items-center gap-3">
                <Icon className={`h-6 w-6 ${plan.color}`} />
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{plan.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{plan.desc}</p>
                </div>
              </div>

              <p className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">{plan.priceLabel}</p>
              <p className="text-xs text-slate-500">
                Renewal: {plan.renewalMonths === 1 ? 'monthly' : `every ${plan.renewalMonths} months`}
              </p>

              <div className="mt-4 space-y-1.5 border-t border-slate-200/50 pt-4 dark:border-white/10">
                {FEATURE_LABELS.map(({ key: fk, label }) => {
                  const on = !!features?.[fk]
                  return (
                    <div key={fk} className="flex items-center gap-2 text-xs">
                      {on
                        ? <Check className="h-3.5 w-3.5 text-green-500" />
                        : <X className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600" />}
                      <span className={on ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-600'}>
                        {label}
                      </span>
                    </div>
                  )
                })}
                <div className="pt-2 text-xs text-slate-500">
                  Branches: <b>{features?.branches === -1 ? 'Unlimited' : features?.branches}</b> ·
                  Users: <b>{features?.max_users === -1 ? 'Unlimited' : features?.max_users}</b> ·
                  Reports: <b className="capitalize">{features?.reports}</b>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
