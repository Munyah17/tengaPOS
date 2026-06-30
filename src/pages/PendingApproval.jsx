import { motion } from 'framer-motion'
import { Clock, LogOut, PhoneCall } from 'lucide-react'
import posIcon from '@/assets/pos-icon.png'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'

export default function PendingApproval() {
  const { clearAuth, profile, tenant } = useAuthStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await clearAuth()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-[#040c1a] px-4">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-center shadow-2xl backdrop-blur-xl">
          <img src={posIcon} alt="tengaPOS" className="mx-auto mb-6 h-14 w-auto" />

          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
            <Clock className="h-8 w-8 text-amber-400" />
          </div>

          <h1 className="text-xl font-extrabold text-white">Account Pending Approval</h1>
          <p className="mt-2 text-sm text-slate-400">
            Hi <span className="font-semibold text-white">{profile?.name || 'there'}</span> —
            your business <span className="font-semibold text-amber-400">{tenant?.name}</span> has been registered
            and is awaiting approval from our team.
          </p>

          <div className="my-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-left text-sm text-amber-300">
            <p className="font-semibold">What happens next?</p>
            <ul className="mt-2 space-y-1.5 text-amber-400/80">
              <li>• Our team reviews your registration</li>
              <li>• We assign your plan (BYOD or Hardware combo)</li>
              <li>• You receive confirmation and can start trading</li>
              <li>• This usually takes less than 24 hours</li>
            </ul>
          </div>

          <a
            href="https://wa.me/263773909307"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: '#25D366' }}
          >
            <PhoneCall className="h-4 w-4" />
            WhatsApp us to speed things up
          </a>

          <button
            onClick={handleSignOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-sm font-medium text-slate-400 transition-colors hover:border-white/20 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </motion.div>
    </div>
  )
}
