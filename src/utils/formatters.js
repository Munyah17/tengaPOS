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
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `TP-${y}${m}${d}-${rand}`
}
