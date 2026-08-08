// Strips a leading zero the moment a second digit follows it ("01" -> "1",
// "05.50" -> "5.50"), leaving "0", "0." and "0.5" alone since those are
// valid input still in progress. Apply this to every raw onChange string
// BEFORE it reaches state, on every quantity/price input in the app --
// deterministic and works identically on every browser/input type, unlike
// onFocus selecting/clearing the field (HTMLInputElement.select() throws
// on type="number" in some engines, confirmed to make the field stop
// accepting input at all rather than just failing to select).
export function stripLeadingZero(str) {
  return String(str ?? '').replace(/^0+(?=\d)/, '')
}

// "" / null / undefined stays null ("not entered yet"); 0 stays exactly 0
// ("explicitly zero") -- collapsing both into 0 (the old `|| 0` pattern
// products/inventory used to save with) silently destroys that
// distinction, which matters for both price (not-yet-priced vs
// genuinely free) and stock (not-yet-counted vs genuinely out of
// stock). Deliberately parseFloat, not parseInt -- Hardware Mode sells
// by weight/length/volume (2.5kg, 71.5 units), and stock_qty is a
// NUMERIC database column, not an integer one; parseInt silently
// truncated any decimal stock quantity passed through it.
export function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}
// Rounded to 4dp, not 2 -- reported live: products genuinely priced in
// fractions of a cent per unit ("$1 for 8" = $0.1250 each) were getting
// silently rounded to $0.13 on save, so 8 of them rang up as $1.04
// instead of the $1.00 the price tag actually promised. Money actually
// charged to a customer (order/transaction totals) still rounds to cents
// as normal -- only the per-unit PRICE itself carries the extra
// precision, so price * qty comes out exact.
export function parseOptionalMoney(value) {
  const n = parseOptionalNumber(value)
  return n === null ? null : Math.round(n * 10000) / 10000
}

// maxDecimals defaults to 2 (ordinary currency amounts: totals, tax,
// change due) so every existing call site is unchanged. Pass 4 for a
// per-unit PRICE display, so a genuinely sub-cent price (e.g. $0.1250)
// is shown as what it actually is instead of silently rounding it to
// $0.13 on screen -- trailing zeros beyond 2dp are trimmed automatically
// (minimumFractionDigits stays 2), so a normal $1.00 price still just
// reads "$1.00", not "$1.0000".
export function formatCurrency(amount, currency = 'USD', maxDecimals = 2) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDecimals,
    }).format(amount)
  } catch {
    // Currency code not recognized by this browser's ICU data — fall back
    // to a plain prefix rather than crashing the page.
    return `${currency} ${Number(amount || 0).toFixed(2)}`
  }
}

// Unit-price-specific alias so call sites read as what they mean (a
// per-item price, which may need up to 4dp) rather than a bare "4" that
// needs a comment to explain itself every time.
export function formatUnitPrice(amount, currency = 'USD') {
  return formatCurrency(amount, currency, 4)
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

// First letter of the first two significant words ("Munyah's Store" -> "MS");
// one-word names take its first two letters ("Bunya" -> "BU"). Always 2
// letters, padded with 'X' if the name can't supply that many.
function twoLetterInitials(name) {
  const words = String(name || '').replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  let initials = words.length >= 2
    ? words[0][0] + words[1][0]
    : (words[0] || '').slice(0, 2)
  initials = initials.toUpperCase().padEnd(2, 'X')
  return initials
}

// Business initials (2) + product initials (2) + 6 random digits, e.g.
// "MIHS354876" for "Metros Investments" selling "Hullets Sugar 2kg". No
// date component -- receipts are already sorted/filtered by their real
// created_at timestamp everywhere in the app, this string is purely the
// printed/human-facing number. productName is whatever the receipt should
// represent for its 2 letters -- the sale's first/primary line item.
export function generateReceiptNumber(businessName, productName) {
  const biz = twoLetterInitials(businessName)
  const prod = twoLetterInitials(productName)
  // 6 digits (1,000,000 slots/tenant) -- this is only the printed number
  // now, not the checkout dedup key (see process_checkout's client_ref), so
  // it just needs to be collision-rare, not collision-proof.
  const rand = Math.floor(Math.random() * 1000000).toString().padStart(6, '0')
  return `${biz}${prod}${rand}`
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
