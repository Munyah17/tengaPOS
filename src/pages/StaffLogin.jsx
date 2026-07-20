/**
 * Platform staff sign-in — deliberately separate from the client /login:
 *   /super-admin  → Super Admin only
 *   /admin/login  → Admin + Tech Support (reached by visiting /admin)
 * Each portal only accepts its own roles; anything else (including client
 * accounts) is signed straight back out with a generic error, so neither
 * page confirms what kind of account an email belongs to.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, ShieldCheck, Headset, LogIn } from 'lucide-react'
import posIcon from '@/assets/pos-icon.png'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

const VARIANTS = {
  super: {
    icon: ShieldCheck,
    title: 'Super Admin Portal',
    subtitle: 'Restricted — platform owner access only',
    accent: 'text-red-400',
    accentBg: 'bg-red-500/10 border-red-500/30',
    button: 'bg-red-600 hover:bg-red-700',
    roles: ['super_admin'],
    destination: '/admin/super/dashboard',
  },
  staff: {
    icon: Headset,
    title: 'Operations Portal',
    subtitle: 'tengaPOS staff — Admin & Technical Support',
    accent: 'text-indigo-400',
    accentBg: 'bg-indigo-500/10 border-indigo-500/30',
    button: 'bg-indigo-600 hover:bg-indigo-700',
    roles: ['admin', 'tech_support'],
    destination: '/admin/dashboard',
  },
}

export default function StaffLogin({ variant = 'staff' }) {
  const cfg = VARIANTS[variant] || VARIANTS.staff
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { signIn, clearAuth, isAuthenticated, userType, role } = useAuthStore()

  // Already signed in as matching staff? Straight to the portal.
  useEffect(() => {
    if (isAuthenticated && userType === 'app_owner' && cfg.roles.includes(role)) {
      navigate(cfg.destination, { replace: true })
    }
  }, [isAuthenticated, userType, role]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email || !password) { toast.error('Enter your email and password'); return }
    setLoading(true)
    try {
      const type = await signIn(email, password)
      const signedRole = useAuthStore.getState().role
      if (type !== 'app_owner' || !cfg.roles.includes(signedRole)) {
        // Wrong portal for this account — drop the session immediately and
        // stay deliberately vague about why.
        await clearAuth()
        throw new Error('Access denied for this portal.')
      }
      toast.success('Welcome back!')
      navigate(cfg.destination)
    } catch (err) {
      toast.error(err.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-black px-4 py-12"
      style={{ minHeight: '100dvh' }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-8 text-center">
            <img src={posIcon} alt="tengaPOS" className="mx-auto mb-4 h-12 w-auto" />
            <div className={`mx-auto mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${cfg.accentBg} ${cfg.accent}`}>
              <cfg.icon className="h-3.5 w-3.5" />
              {cfg.title}
            </div>
            <p className="text-sm text-slate-400">{cfg.subtitle}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
              <input
                type="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="you@tengapos.co.zw"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${cfg.button}`}
            >
              <LogIn className="h-4 w-4" />
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Authorised tengaPOS personnel only. All access is logged.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
