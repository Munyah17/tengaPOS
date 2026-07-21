import { useRef } from 'react'
import { Calendar } from 'lucide-react'
import { formatDate } from '@/utils/formatters'

/**
 * Date picker that always displays dd/mm/yyyy, regardless of the visitor's
 * browser/OS locale. A bare `<input type="date">` looks right in dev (where
 * the machine is usually set to en-GB) but renders mm/dd/yyyy for anyone on
 * a US-locale browser — the display format is controlled by the browser,
 * not by anything in HTML/CSS/JS. This keeps the native picker (calendar
 * widget, mobile date wheel) for its UX, but layers a locale-proof dd/mm/yyyy
 * label on top — the native input is transparent but still receives clicks.
 */
export default function DateInput({ value, onChange, placeholder = 'Select date', className = '', min, max, disabled, required }) {
  const inputRef = useRef(null)

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={onChange}
        min={min}
        max={max}
        disabled={disabled}
        required={required}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <div className={`flex h-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 ${disabled ? 'opacity-60' : ''}`}>
        <Calendar className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <span className={value ? 'text-slate-900 dark:text-white' : 'text-slate-400'}>
          {value ? formatDate(value) : placeholder}
        </span>
      </div>
    </div>
  )
}
