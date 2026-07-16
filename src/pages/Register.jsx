import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UserPlus, ArrowLeft } from 'lucide-react'
import posIcon from '@/assets/pos-icon.png'
import Button from '@/components/common/Button'
import { useAuthStore } from '@/stores/authStore'
import toast from 'react-hot-toast'

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', businessName: '', businessType: 'retail' })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { signUp } = useAuthStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const data = await signUp(form.email, form.password, form.name, form.businessName, form.businessType)
      if (data.user && !data.session) {
        // Email confirmation required — they pick trial or plan after signing in
        toast.success('Almost there! Check your email to confirm, then sign in to choose your plan or free trial.')
        navigate('/login')
      } else {
        // Immediate session — choose free trial or a plan on checkout
        toast.success('Account created! Pick your free trial or a plan.')
        navigate('/checkout')
      }
    } catch (err) {
      toast.error(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-y-auto bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 px-4 py-10 sm:py-14"
      style={{ minHeight: '100dvh' }}
    >
      {/* absolute (not fixed) — a fixed background stays pinned to the
          viewport while a tall form scrolls past it, which on a short
          screen visually crosses through the input fields */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-brand-600/10 blur-[128px]" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-md"
      >
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          {/* Back to home */}
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="mb-6 text-center sm:mb-8">
            <img src={posIcon} alt="tengaPOS" className="mx-auto mb-4 h-12 w-auto sm:h-14" />
            <h1 className="text-2xl font-extrabold text-white">Create your account</h1>
            <p className="mt-1 text-sm text-slate-400">
              Choose a <span className="font-semibold text-green-400">free 7-day trial</span> or a plan next — nothing is charged until you decide
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={update('name')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="John Doe"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Business Name</label>
              <input
                type="text"
                value={form.businessName}
                onChange={update('businessName')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="My Store"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Business Type</label>
              <select
                value={form.businessType}
                onChange={update('businessType')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="retail" className="bg-slate-900">Retail</option>
                <option value="restaurant" className="bg-slate-900">Restaurant</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={update('email')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={update('password')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              <UserPlus className="h-4 w-4" />
              {loading ? 'Creating...' : 'Create Account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-brand-400 hover:text-brand-300">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
