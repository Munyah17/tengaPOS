import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Monitor, Download as DownloadIcon, FileText, ShieldCheck, Copy, Check,
  WifiOff, ArrowRight, CircleAlert, MonitorDown,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { getDownloadInfo } from '@/lib/desktopLicense'
import Navbar from '@/components/landing/Navbar'
import Footer from '@/components/landing/Footer'

// The download button hits the 302 endpoint, not the signed URL from
// /download/info — that signed URL expires in 5 min, the 302 mints a fresh
// one per click.
const DL_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/desktop-license/v1/download?os=win32-x64&channel=stable`

const REQUIREMENTS = [
  'Windows 10 or 11 (64-bit)',
  '~250 MB free disk space',
  'Internet needed once — to activate your license. After that it works fully offline.',
  'A $150 once-off license code (buy in your tengaPOS account)',
]

const STEPS = [
  { n: '1', title: 'Download the installer', text: 'Click Download — the link is signed fresh for every click and always serves the latest stable release.' },
  { n: '2', title: 'Run the installer', text: 'Open the .exe and follow the setup wizard. Your data stays on this PC.' },
  { n: '3', title: 'Activate with your code', text: 'Type in the TGA-… activation code from your tengaPOS account (Buy Desktop License). The app unlocks instantly.' },
]

export default function Download() {
  const [info, setInfo] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | none
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getDownloadInfo('win32-x64', 'stable')
      .then((d) => { setInfo(d); setState('ready') })
      .catch(() => setState('none'))
  }, [])

  const copySha = async () => {
    try {
      await navigator.clipboard.writeText(info.sha256)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard */ }
  }

  const sizeMb = info?.size_bytes ? (info.size_bytes / 1048576).toFixed(1) : null

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Navbar />

      <section className="relative overflow-hidden pb-20 pt-32">
        <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-brand-600/15 blur-[100px]" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-700 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-400">
              <Monitor className="h-3.5 w-3.5" /> Windows Installer
            </span>
            <h1 className="mt-5 text-4xl font-extrabold text-slate-900 dark:text-white sm:text-5xl">
              Download tengaPOS Desktop
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-500 dark:text-slate-400">
              The offline till — sells through load-shedding and dead zones.
              Once-off $150 license, no subscription.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {state === 'loading' && (
            <div className="flex items-center justify-center gap-3 py-6 text-sm text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              Checking latest release…
            </div>
          )}

          {state === 'none' && (
            <div className="py-4 text-center">
              <CircleAlert className="mx-auto h-10 w-10 text-amber-500" />
              <h3 className="mt-3 text-lg font-bold text-slate-900 dark:text-white">Installer coming soon</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                The Windows release isn't published yet. Check back shortly or{' '}
                <a href="https://wa.me/263773909307" className="text-brand-600 hover:underline dark:text-brand-400">
                  contact us on WhatsApp
                </a>.
              </p>
            </div>
          )}

          {state === 'ready' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-400">
                    <MonitorDown className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">tengaPOS Setup {info.version}.exe</p>
                    <p className="text-xs text-slate-500">
                      v{info.version} · stable{sizeMb ? ` · ${sizeMb} MB` : ''}
                    </p>
                  </div>
                </div>
                {info.release_notes_url && (
                  <a href={info.release_notes_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
                    <FileText className="h-3.5 w-3.5" /> Release notes
                  </a>
                )}
              </div>

              <a href={DL_URL}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-700">
                <DownloadIcon className="h-4 w-4" /> Download for Windows
              </a>

              <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <ShieldCheck className="h-4 w-4 shrink-0 text-green-500" />
                <span className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  SHA-256: {info.sha256}
                </span>
                <button onClick={copySha} className="ml-auto shrink-0 rounded p-1 text-slate-400 hover:bg-white dark:hover:bg-slate-700" title="Copy checksum">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}

          {/* Requirements + steps */}
          <div className="mt-8 grid gap-8 border-t border-slate-100 pt-8 dark:border-slate-800 sm:grid-cols-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <WifiOff className="h-4 w-4 text-brand-500" /> Requirements
              </h3>
              <ul className="mt-3 space-y-2">
                {REQUIREMENTS.map((r) => (
                  <li key={r} className="flex gap-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-brand-500" /> {r}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Install & activate</h3>
              <ol className="mt-3 space-y-3">
                {STEPS.map((s) => (
                  <li key={s.n} className="flex gap-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-extrabold text-brand-700 dark:bg-brand-900/40 dark:text-brand-400">
                      {s.n}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{s.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Don't have a license yet?{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
              Create an account <ArrowRight className="inline h-3 w-3" />
            </Link>{' '}
            — buy the once-off desktop license from the Desktop App page after signing in.
          </div>
        </motion.div>
      </section>

      <Footer />
    </div>
  )
}
