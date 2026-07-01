import { Settings, Shield, Globe, Bell, Lock } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { Navigate } from 'react-router-dom'

export default function AdminSettings() {
  const { role } = useAuthStore()
  if (role !== 'super_admin') return <Navigate to="/admin/dashboard" replace />

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">Platform Settings</h1>
        <p className="mt-1 text-sm text-slate-400">System configuration — Super Admin only</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { icon: Shield, label: 'Security', desc: 'Auth policies, API keys, 2FA enforcement', badge: 'Soon' },
          { icon: Globe, label: 'ZIMRA Config', desc: 'Fiscal platform-wide settings and FDMS certs', badge: 'Soon' },
          { icon: Bell, label: 'Announcements', desc: 'Broadcast system messages to all tenants', badge: 'Soon' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="mb-3 flex items-center justify-between">
              <item.icon className="h-5 w-5 text-indigo-400" />
              <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">{item.badge}</span>
            </div>
            <h3 className="font-semibold text-white">{item.label}</h3>
            <p className="mt-1 text-xs text-slate-500">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
