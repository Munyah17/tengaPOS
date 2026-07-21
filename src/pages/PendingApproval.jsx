import { useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, LogOut, PhoneCall, RefreshCw, PauseCircle, Ban } from 'lucide-react'
import posIcon from '@/assets/pos-icon.png'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'

const STATUS_COPY = {
  pending: {
    icon: Clock,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/10',
    title: 'Account Pending Approval',
    lead: 'has been registered and is awaiting approval from our team.',
    box: {
      border: 'border-amber-500/20', bg: 'bg-amber-500/5', text: 'text-amber-300', textDim: 'text-amber-400/80',
      heading: 'What happens next?',
      items: [
        'Our team reviews your registration',
        'We assign your plan (BYOD or Hardware combo)',
        'You receive confirmation and can start trading',
        'This usually takes less than 24 hours',
      ],
    },
    showRetry: true,
  },
  stalled: {
    icon: PauseCircle,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/10',
    title: 'A Little More Information Needed',
    lead: 'is on hold while our team follows up with you.',
    box: {
      border: 'border-orange-500/20', bg: 'bg-orange-500/5', text: 'text-orange-300', textDim: 'text-orange-400/80',
      heading: 'Reason',
      items: null,
    },
    showRetry: true,
  },
  rejected: {
    icon: Ban,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    title: 'Application Not Approved',
    lead: "wasn't approved.",
    box: {
      border: 'border-red-500/20', bg: 'bg-red-500/5', text: 'text-red-300', textDim: 'text-red-400/80',
      heading: 'Reason',
      items: null,
    },
    showRetry: false,
  },
}

export default function PendingApproval() {
  const { clearAuth, initAuth, profile, tenant, tenantStatus } = useAuthStore()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)
  const copy = STATUS_COPY[tenantStatus] || STATUS_COPY.pending
  const Icon = copy.icon
  const reasonText = tenantStatus === 'rejected' ? tenant?.rejection_reason : tenant?.stalled_reason

  const handleSignOut = async () => {
    await clearAuth()
    navigate('/')
  }

  const handleCheckStatus = async () => {
    setChecking(true)
    await initAuth()
    const { tenantStatus: fresh } = useAuthStore.getState()
    if (fresh === 'active') {
      navigate('/app/dashboard')
    } else {
      setChecking(false)
    }
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

          <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${copy.iconBg}`}>
            <Icon className={`h-8 w-8 ${copy.iconColor}`} />
          </div>

          <h1 className="text-xl font-extrabold text-white">{copy.title}</h1>
          <p className="mt-2 text-sm text-slate-400">
            Hi <span className="font-semibold text-white">{profile?.name || 'there'}</span> —
            your business <span className="font-semibold text-amber-400">{tenant?.name}</span> {copy.lead}
          </p>

          <div className={`my-6 rounded-xl border p-4 text-left text-sm ${copy.box.border} ${copy.box.bg} ${copy.box.text}`}>
            <p className="font-semibold">{copy.box.heading}</p>
            {copy.box.items ? (
              <ul className={`mt-2 space-y-1.5 ${copy.box.textDim}`}>
                {copy.box.items.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            ) : (
              <p className={`mt-1 ${copy.box.textDim}`}>{reasonText || 'Contact our team for details.'}</p>
            )}
          </div>

          {copy.showRetry && (
            <button
              onClick={handleCheckStatus}
              disabled={checking}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/10 py-3 text-sm font-semibold text-brand-400 transition-colors hover:bg-brand-500/20 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking…' : 'Check approval status'}
            </button>
          )}

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
