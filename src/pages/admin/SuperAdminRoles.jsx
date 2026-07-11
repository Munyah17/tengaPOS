import { ShieldCheck, Shield, Wrench, Store, UserCog, Eye, CreditCard, HandHelping } from 'lucide-react'

const TENANT_ROLES = [
  { icon: Store, label: 'Vendor (Owner)', color: 'text-green-500', desc: 'Full control of their business: POS, inventory, reports, staff, branches, fiscalisation, payments, HR, settings, and billing/plan decisions.' },
  { icon: UserCog, label: 'Shop Manager', color: 'text-blue-500', desc: 'Runs day-to-day operations — everything except billing/plan and branding decisions.' },
  { icon: Eye, label: 'Supervisor', color: 'text-purple-500', desc: 'Shift-level authority: POS, orders, transactions, shift reports, discounts, voids.' },
  { icon: CreditCard, label: 'Cashier', color: 'text-teal-500', desc: 'POS, orders, and tasks only.' },
  { icon: HandHelping, label: 'Shop Assistant', color: 'text-slate-500', desc: 'POS and tasks only — the narrowest role.' },
]

const ROLES = [
  {
    key: 'super_admin',
    icon: ShieldCheck,
    label: 'Super Admin',
    color: 'border-red-500/40 bg-red-500/5',
    iconColor: 'text-red-500',
    summary: 'Platform owner — unlimited and total control.',
    can: [
      'Approve, suspend, and delete tenants',
      'Assign plans, features, white-label, and backups',
      'Create and remove Admin and Tech Support accounts',
      'Send announcements and email broadcasts',
      'View billing, revenue, audit logs, and compliance',
      'Configure system settings',
    ],
    cannot: [],
  },
  {
    key: 'admin',
    icon: Shield,
    label: 'Admin (Staff)',
    color: 'border-indigo-500/40 bg-indigo-500/5',
    iconColor: 'text-indigo-500',
    summary: 'Day-to-day operations staff. Explicitly restricted.',
    can: [
      'Work support tickets',
      'Send announcements',
      'View operational reports (read-only)',
    ],
    cannot: [
      'Approve or suspend tenants',
      'Change plans or pricing',
      'Create staff accounts',
      'Access billing, audit logs, or system settings',
    ],
  },
  {
    key: 'tech_support',
    icon: Wrench,
    label: 'Tech Support',
    color: 'border-orange-500/40 bg-orange-500/5',
    iconColor: 'text-orange-500',
    summary: 'Field and remote technicians.',
    can: [
      'Work assigned support tickets',
      'Be assigned as dedicated technician to Business/Enterprise tenants',
    ],
    cannot: [
      'Everything else',
    ],
  },
]

export default function SuperAdminRoles() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Roles & Permissions</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Platform role definitions. These are enforced by database row-level security and route guards.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {ROLES.map((role) => {
          const Icon = role.icon
          return (
            <div key={role.key} className={`rounded-2xl border p-5 ${role.color}`}>
              <div className="flex items-center gap-3">
                <Icon className={`h-6 w-6 ${role.iconColor}`} />
                <p className="font-bold text-slate-900 dark:text-white">{role.label}</p>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{role.summary}</p>

              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-slate-500">Can</p>
              <ul className="mt-1 space-y-1">
                {role.can.map((item) => (
                  <li key={item} className="text-sm text-slate-700 dark:text-slate-300">• {item}</li>
                ))}
              </ul>

              {role.cannot.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-bold uppercase tracking-widest text-slate-500">Cannot</p>
                  <ul className="mt-1 space-y-1">
                    {role.cannot.map((item) => (
                      <li key={item} className="text-sm text-slate-500 line-through decoration-slate-400/50">• {item}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Tenant-side roles */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Client Business Roles</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Roles inside each tenant. All tenant data is isolated per business by row-level security;
          module access is further limited by the tenant's plan.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TENANT_ROLES.map((r) => {
            const Icon = r.icon
            return (
              <div key={r.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${r.color}`} />
                  <p className="font-semibold text-slate-900 dark:text-white">{r.label}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{r.desc}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Full specification: <span className="font-mono">docs/ROLES.md</span> in the repository.
        </p>
      </div>
    </div>
  )
}
