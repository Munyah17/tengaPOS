import { BarChart3, TrendingUp, Building2, Users } from 'lucide-react'

export default function AdminReports() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Platform Reports</h1>
        <p className="mt-1 text-sm text-slate-400">Revenue, growth, and usage analytics across all tenants</p>
      </div>

      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 text-slate-500">
        <BarChart3 className="h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">Advanced analytics coming soon</p>
        <p className="text-xs text-slate-600">Tenant MRR, churn rate, feature adoption, and more</p>
      </div>
    </div>
  )
}
