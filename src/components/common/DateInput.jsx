import { useState, useRef, useEffect } from 'react'
import { Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate } from '@/utils/formatters'

// Companion time-of-day field for date-range filters that need to narrow
// within a day, not just between whole days (native <input type="date">
// alone can't carry a time, and type="datetime-local" has worse mobile/
// old-Android support than pairing a plain type="time" input next to it).
export function TimeField({ value, onChange, label }) {
  return (
    <div>
      {label && <label className="mb-1 block text-[10px] font-semibold text-slate-500">{label}</label>}
      <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-800">
        <Clock className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <input
          type="time"
          value={value}
          onChange={onChange}
          className="w-full bg-transparent text-sm text-slate-900 focus:outline-none dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
    </div>
  )
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function toISODate(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseISODate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m: m - 1, d }
}

/**
 * Self-built calendar popover — deliberately NOT a bare <input type="date">.
 * That native control's picker/typing UX is entirely up to the browser, and
 * on some older Android WebViews (the exact devices this app targets — see
 * vite.config.js) it can silently fall back to plain keyboard text entry
 * with zero visible affordance, which reads as "greyed out and broken"
 * even though the input technically still works. This version renders its
 * own grid so behaviour is identical everywhere: desktop, old Android, iOS.
 * Always displays/parses dd/mm/yyyy on screen; value/onChange still use
 * plain yyyy-mm-dd strings so every existing caller (onChange={e =>
 * setX(e.target.value)}) keeps working unmodified.
 */
export default function DateInput({ value, onChange, placeholder = 'Select date', className = '', min, max, disabled, required }) {
  const [open, setOpen] = useState(false)
  const parsed = parseISODate(value)
  const today = new Date()
  const [viewYear, setViewYear] = useState(parsed?.y ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed?.m ?? today.getMonth())
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openPicker = () => {
    if (disabled) return
    const p = parseISODate(value)
    setViewYear(p?.y ?? today.getFullYear())
    setViewMonth(p?.m ?? today.getMonth())
    setOpen((o) => !o)
  }

  const pick = (day) => {
    const iso = toISODate(viewYear, viewMonth, day)
    if (min && iso < min) return
    if (max && iso > max) return
    onChange({ target: { value: iso } })
    setOpen(false)
  }

  const changeMonth = (delta) => {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setViewYear(y)
    setViewMonth(m)
  }

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7 // Monday-first grid
  const cells = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div ref={rootRef} className={`relative h-10 ${className}`}>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-required={required}
        className={`flex h-10 w-full items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm transition-colors dark:bg-slate-800 ${
          open ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
        } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
      >
        <Calendar className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <span className={value ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}>
          {value ? formatDate(value) : placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => changeMonth(-1)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {firstOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" onClick={() => changeMonth(1)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-white">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <span key={`b${i}`} />
              const iso = toISODate(viewYear, viewMonth, day)
              const isSelected = iso === value
              const isToday = iso === toISODate(today.getFullYear(), today.getMonth(), today.getDate())
              const outOfRange = (min && iso < min) || (max && iso > max)
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => pick(day)}
                  disabled={outOfRange}
                  className={`rounded-lg py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                    isSelected
                      ? 'bg-brand-600 text-white'
                      : isToday
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange({ target: { value: '' } }); setOpen(false) }}
              className="mt-2 w-full rounded-lg py-1 text-center text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
