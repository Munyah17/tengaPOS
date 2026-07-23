import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UserPlus, ArrowLeft, ChevronDown } from 'lucide-react'
import posIcon from '@/assets/pos-icon.png'
import Button from '@/components/common/Button'
import { useAuthStore } from '@/stores/authStore'
import { INDUSTRIES } from '@/lib/whitelabelTheme'
import toast from 'react-hot-toast'

const TEAM_SIZE_RANGES = ['1-5', '6-15', '16-30', '31-50', '50+']

export default function Register() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', businessName: '', businessType: 'retail',
    industry: '', location: '', requestedBranches: '', teamSizeRange: '', requestedPlanPref: '',
    workAddress: '', workContact: '', specialRequirements: '',
  })
  const [showMore, setShowMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { signUp } = useAuthStore()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (!form.phone.trim()) { toast.error('Phone number is required'); return }
    setLoading(true)
    try {
      const data = await signUp(form.email, form.password, form.name, form.businessName, form.businessType, form.phone, {
        industry: form.industry,
        location: form.location,
        requestedBranches: form.requestedBranches,
        teamSizeRange: form.teamSizeRange,
        requestedPlanPref: form.requestedPlanPref,
        workAddress: form.workAddress,
        workContact: form.workContact,
        specialRequirements: form.specialRequirements,
      })
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
                <option value="workshop" className="bg-slate-900">Workshop (Garage / Fitment)</option>
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
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Phone Number</label>
              <input
                type="tel"
                value={form.phone}
                onChange={update('phone')}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="+263 77 123 4567"
                required
              />
              <p className="mt-1 text-xs text-slate-500">So we can reach you if you need help getting set up</p>
            </div>

            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/10"
            >
              A few more details (helps us set you up faster)
              <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
            </button>

            {showMore && (
              <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Industry</label>
                  <select
                    value={form.industry}
                    onChange={update('industry')}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="" className="bg-slate-900">Select…</option>
                    {INDUSTRIES.map((i) => (
                      <option key={i.key} value={i.key} className="bg-slate-900">{i.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Location</label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={update('location')}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="e.g. Harare"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Branches planned</label>
                    <input
                      type="number"
                      min="1"
                      value={form.requestedBranches}
                      onChange={update('requestedBranches')}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-300">Team size</label>
                    <select
                      value={form.teamSizeRange}
                      onChange={update('teamSizeRange')}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="" className="bg-slate-900">Select…</option>
                      {TEAM_SIZE_RANGES.map((r) => (
                        <option key={r} value={r} className="bg-slate-900">{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Preferred plan</label>
                  <select
                    value={form.requestedPlanPref}
                    onChange={update('requestedPlanPref')}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="undecided" className="bg-slate-900">Not sure yet</option>
                    <option value="byod" className="bg-slate-900">BYOD (use your own device)</option>
                    <option value="combo" className="bg-slate-900">Hardware Combo (tablet + printer)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Work Address</label>
                  <input
                    type="text"
                    value={form.workAddress}
                    onChange={update('workAddress')}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Shop address"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Work Contact</label>
                  <input
                    type="tel"
                    value={form.workContact}
                    onChange={update('workContact')}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Business phone line, if different"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Special Requirements</label>
                  <textarea
                    value={form.specialRequirements}
                    onChange={update('specialRequirements')}
                    rows={2}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="Anything specific we should know?"
                  />
                </div>
              </div>
            )}

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
