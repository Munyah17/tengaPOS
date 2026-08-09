import { useState } from 'react'
import { Shield, Globe, KeyRound, User, CreditCard, Loader2, ExternalLink } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function AdminSettings() {
  const { role, profile, user, initAuth } = useAuthStore()
  const isSuperAdmin = role === 'super_admin'

  const [name, setName] = useState(profile?.name || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const saveProfile = async (e) => {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name is required'); return }
    setSavingProfile(true)
    const { error } = await supabase
      .from('app_users')
      .update({ name: name.trim() })
      .eq('id', user?.id)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Profile updated')
      await initAuth()
    }
    setSavingProfile(false)
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return }
    setSavingPassword(true)
    try {
      // Re-authenticate first so a hijacked session can't silently change the password
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user?.email,
        password: currentPassword,
      })
      if (signInErr) throw new Error('Current password is incorrect')
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      toast.success('Password changed')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
          {isSuperAdmin ? 'System Settings' : 'Profile Settings'}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {isSuperAdmin ? 'Your account and platform configuration' : 'Manage your account'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Profile */}
        <form onSubmit={saveProfile} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-500" />
            <h2 className="font-bold text-slate-900 dark:text-white">Profile</h2>
          </div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Full Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <label className="mb-1 block text-xs font-semibold text-slate-500">Email</label>
          <input
            value={user?.email || ''}
            disabled
            className="mb-4 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:border-white/10 dark:bg-white/5"
          />
          <button
            type="submit"
            disabled={savingProfile}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Profile
          </button>
        </form>

        {/* Password */}
        <form onSubmit={changePassword} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-indigo-500" />
            <h2 className="font-bold text-slate-900 dark:text-white">Change Password</h2>
          </div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Current Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <label className="mb-1 block text-xs font-semibold text-slate-500">New Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <label className="mb-1 block text-xs font-semibold text-slate-500">Confirm New Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
          <button
            type="submit"
            disabled={savingPassword}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
            Update Password
          </button>
        </form>

        {/* Platform configuration — Super Admin only */}
        {isSuperAdmin && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <div className="mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5 text-indigo-500" />
                <h2 className="font-bold text-slate-900 dark:text-white">ZIMRA Fiscal Platform</h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 dark:border-white/5">
                  <span className="text-slate-500">FDMS Environment</span>
                  <span className="rounded-full bg-green-500/15 px-3 py-0.5 text-xs font-bold text-green-500">Production</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 dark:border-white/5">
                  <span className="text-slate-500">Endpoint</span>
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">fdms.zimra.co.zw</span>
                </div>
                <p className="pt-1 text-xs text-slate-500">
                  Per-tenant device credentials are managed by each tenant under Settings → ZIMRA Fiscal.
                  Platform-wide status is on the <b>ZIMRA Compliance</b> page.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <div className="mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-indigo-500" />
                <h2 className="font-bold text-slate-900 dark:text-white">Payment Providers</h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 dark:border-white/5">
                  <span className="text-slate-500">Stripe (cards)</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">Hosted checkout · keys in Supabase secrets</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 dark:border-white/5">
                  <span className="text-slate-500">Paynow (EcoCash)</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">Hosted checkout · keys in Supabase secrets</span>
                </div>
                <p className="pt-1 text-xs text-slate-500">
                  Card details never touch tengaPOS — payments run on the providers' hosted pages
                  and webhooks activate plans automatically. Collected payments show on <b>Billing &amp; Revenue</b>.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-white/5 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-500" />
                <h2 className="font-bold text-slate-900 dark:text-white">Security</h2>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-xl border border-slate-100 px-4 py-3 dark:border-white/5">
                  <p className="font-semibold text-slate-900 dark:text-white">Row-Level Security</p>
                  <p className="mt-1 text-xs text-slate-500">Every table is tenant-isolated; platform staff access is role-checked in the database.</p>
                </div>
                <div className="rounded-xl border border-slate-100 px-4 py-3 dark:border-white/5">
                  <p className="font-semibold text-slate-900 dark:text-white">Audit Trail</p>
                  <p className="mt-1 text-xs text-slate-500">Approvals, suspensions, account changes, and payments are logged — see Audit Logs.</p>
                </div>
                <div className="rounded-xl border border-slate-100 px-4 py-3 dark:border-white/5">
                  <p className="font-semibold text-slate-900 dark:text-white">Account Control</p>
                  <p className="mt-1 text-xs text-slate-500">Only you can create platform staff and delete client accounts. No invitation links exist.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
