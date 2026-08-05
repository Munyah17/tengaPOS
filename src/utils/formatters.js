export function formatCurrency(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    // Currency code not recognized by this browser's ICU data — fall back
    // to a plain prefix rather than crashing the page.
    return `${currency} ${Number(amount || 0).toFixed(2)}`
  }
}

// dd/mm/yyyy is the platform-wide date format
export function formatDate(date) {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date))
}

// yyyy-mm-dd for a Date, using its LOCAL calendar date -- never
// `date.toISOString().slice(0, 10)`, which converts to UTC first and
// silently rolls back to the previous day for any timezone east of UTC
// (confirmed live: exactly this bug meant a "today" default/filter fell on
// yesterday for Zimbabwe's UTC+2 for a couple of hours after each
// midnight). Use this anywhere a plain calendar-date string is needed —
// default form values, DATE-column (not TIMESTAMPTZ) query boundaries.
export function toLocalDateStr(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDateTime(date) {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num)
}

export function generateReceiptNumber() {
  const now = new Date()
  const y = now.getFullYear().toString().slice(-2)
  const m = (now.getMonth() + 1).toString().padStart(2, '0')
  const d = now.getDate().toString().padStart(2, '0')
  // 6 digits (1,000,000 slots/tenant/day) -- this is only the printed
  // number now, not the checkout dedup key (see process_checkout's
  // client_ref), so it just needs to be collision-rare, not collision-proof.
  const rand = Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
  return `TP-${y}${m}${d}-${rand}`
}

// prefix is 'QUO' for quotations, 'INV' for invoices
export function generateDocNumber(prefix) {
  const now = new Date()
  const y = now.getFullYear().toString().slice(-2)
  const m = (now.getMonth() + 1).toString().padStart(2, '0')
  const d = now.getDate().toString().padStart(2, '0')
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${prefix}-${y}${m}${d}-${rand}`
}
