import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Megaphone, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useSiteBanner } from '@/lib/platformSettings'

const SESSION_KEY = 'tengapos_banner_dismissed'

const TYPE_STYLES = {
  info: { accent: 'bg-blue-600', icon: Megaphone, iconWrap: 'bg-blue-100 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' },
  promo: { accent: 'bg-green-600', icon: Sparkles, iconWrap: 'bg-green-100 text-green-600 dark:bg-green-500/10 dark:text-green-400' },
  warning: { accent: 'bg-amber-500', icon: TriangleAlert, iconWrap: 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
}

// Public announcement popup, toggled/edited from the Super Admin or Admin portal.
// Shows once per browser session (sessionStorage) so it never nags on every refresh.
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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 12 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
          >
            <div className={`h-1.5 w-full ${style.accent}`} />
            <button
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-4 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-7 pt-8 text-center">
              <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${style.iconWrap}`}>
                <Icon className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold leading-relaxed text-slate-900 dark:text-white">
                {banner.text}
              </p>
              <button
                onClick={close}
                className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
