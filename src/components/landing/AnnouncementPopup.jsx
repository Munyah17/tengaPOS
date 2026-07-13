import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Megaphone, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useSiteBanner } from '@/lib/platformSettings'

const SESSION_KEY = 'tengapos_banner_dismissed'

const TYPE_STYLES = {
  info: {
    icon: Megaphone,
    gradient: 'from-blue-600 to-indigo-600',
    ring: 'ring-blue-500/30',
    iconWrap: 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
    primaryBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  promo: {
    icon: Sparkles,
    gradient: 'from-emerald-500 to-green-600',
    ring: 'ring-emerald-500/30',
    iconWrap: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  warning: {
    icon: TriangleAlert,
    gradient: 'from-amber-500 to-orange-600',
    ring: 'ring-amber-500/30',
    iconWrap: 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    primaryBtn: 'bg-amber-500 hover:bg-amber-600 text-slate-900',
  },
}

function CTAButton({ button, index, style, onNavigate }) {
  const isPrimary = index === 0
  const classes = `flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-center transition-colors ${
    isPrimary
      ? style.primaryBtn
      : 'border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5'
  }`
  if (button.url?.startsWith('/')) {
    return (
      <Link to={button.url} onClick={onNavigate} className={classes}>
        {button.label}
      </Link>
    )
  }
  return (
    <a href={button.url} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={classes}>
      {button.label}
    </a>
  )
}

// Public announcement popup, toggled/edited from the Super Admin or Admin portal.
// Shows once per browser session (sessionStorage) so it never nags on every refresh,
// and re-appears automatically the moment the published announcement text changes.
export default function AnnouncementPopup() {
  const banner = useSiteBanner()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!banner?.enabled || !banner.text) return
    const dismissedFor = sessionStorage.getItem(SESSION_KEY)
    if (dismissedFor === banner.text) return
    setOpen(true)
  }, [banner])

  function close() {
    setOpen(false)
    if (banner?.text) sessionStorage.setItem(SESSION_KEY, banner.text)
  }

  if (!banner?.enabled || !banner.text) return null
  const style = TYPE_STYLES[banner.type] || TYPE_STYLES.info
  const Icon = style.icon
  const buttons = (banner.buttons || []).filter((b) => b?.label && b?.url).slice(0, 2)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.3 }}
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 dark:bg-slate-900 ${style.ring}`}
          >
            <button
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-full bg-black/30 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
            >
              <X className="h-5 w-5" />
            </button>

            {banner.imageUrl ? (
              <div className="relative h-44 w-full">
                <img src={banner.imageUrl} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/0" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <h3 className="text-xl font-extrabold leading-tight text-white drop-shadow">
                    {banner.title || banner.text}
                  </h3>
                </div>
              </div>
            ) : (
              <div className={`h-1.5 w-full bg-gradient-to-r ${style.gradient}`} />
            )}

            <div className="p-6 text-center">
              {!banner.imageUrl && (
                <motion.div
                  animate={banner.type === 'promo' ? { rotate: [0, 12, -8, 0] } : {}}
                  transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.5 }}
                  className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${style.iconWrap}`}
                >
                  <Icon className="h-7 w-7" />
                </motion.div>
              )}

              {!banner.imageUrl && banner.title && (
                <h3 className="mb-1.5 text-xl font-extrabold text-slate-900 dark:text-white">
                  {banner.title}
                </h3>
              )}

              {(!banner.imageUrl || banner.title) && (
                <p className={`leading-relaxed text-slate-600 dark:text-slate-300 ${banner.imageUrl ? 'mt-3 text-sm' : 'text-sm'}`}>
                  {banner.text}
                </p>
              )}

              {buttons.length > 0 ? (
                <>
                  <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
                    {buttons.map((b, i) => (
                      <CTAButton key={i} button={b} index={i} style={style} onNavigate={close} />
                    ))}
                  </div>
                  <button
                    onClick={close}
                    className="mt-3 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    Maybe later
                  </button>
                </>
              ) : (
                <button
                  onClick={close}
                  className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-bold transition-colors ${style.primaryBtn}`}
                >
                  Got it
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
