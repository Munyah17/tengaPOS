import { useState } from 'react'

// Final validation restores stock and books the refund -- but only when the
// goods actually came back sellable is that a real, physical guarantee.
// This confirmation is now required before validate_return will proceed at
// all (see supabase/migrations/1786140000_returns_reverification.sql).
// Shared by Transactions.jsx and Requests.jsx -- both surface the same
// "Validate" action on a return, so both need the same confirmation.
const CONDITIONS = [
  { value: 'sellable', label: 'Sellable', hint: 'Restores stock' },
  { value: 'damaged', label: 'Damaged', hint: 'Refund only, stock not restored' },
  { value: 'not_returnable', label: 'Not Returnable', hint: 'Refund only, stock not restored' },
]

export default function ValidateReturnModal({ onClose, onSubmit }) {
  const [condition, setCondition] = useState('sellable')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-1 font-bold text-slate-900 dark:text-white">Confirm Goods Received</h3>
        <p className="mb-3 text-xs text-slate-500">
          Physically inspect the returned goods before validating — this is what actually restores stock.
        </p>
        <div className="space-y-1.5">
          {CONDITIONS.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                condition === c.value
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <input type="radio" name="goods_condition" checked={condition === c.value} onChange={() => setCondition(c.value)} />
                <span className="font-medium text-slate-900 dark:text-white">{c.label}</span>
              </span>
              <span className="text-xs text-slate-400">{c.hint}</span>
            </label>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Inspection notes (optional)…"
          rows={2}
          className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        />
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={async () => {
              setBusy(true)
              await onSubmit(condition, notes.trim() || null)
              setBusy(false)
            }}
            disabled={busy}
            className="flex-1 rounded-xl bg-purple-600 py-2 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-60"
          >
            {busy ? 'Validating…' : 'Validate Return'}
          </button>
        </div>
      </div>
    </div>
  )
}
