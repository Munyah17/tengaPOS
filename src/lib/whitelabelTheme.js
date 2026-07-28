/**
 * Runtime white-label theming.
 *
 * Every `bg-brand-600`, `text-brand-400`, gradient, etc. is defined in
 * tailwind.config.js as `rgb(var(--color-brand-600) / <alpha>)`, reading
 * from the --color-brand-50 … --color-brand-950 custom properties declared
 * in index.css. So re-branding a tenant's whole portal is just overriding
 * those variables on <html> with a shade scale generated from their primary
 * colour. Also swaps the favicon, document title, and the mobile browser
 * theme-color to the tenant's brand.
 *
 * Applied by AppLayout when the signed-in tenant has whitelabel.enabled;
 * cleared on logout/unmount so the Super Admin portal and login screen
 * always show tengaPOS (or the defaults from index.html).
 */

// How far each shade sits from the base colour: positive = toward white,
// negative = toward black. 500 is the tenant's colour as given.
const SHADE_MIX = [
  ['50', 0.94],
  ['100', 0.88],
  ['200', 0.75],
  ['300', 0.6],
  ['400', 0.3],
  ['500', 0],
  ['600', -0.14],
  ['700', -0.28],
  ['800', -0.42],
  ['900', -0.55],
  ['950', -0.68],
]

function parseHex(hex) {
  if (typeof hex !== 'string') return null
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixChannel(c, t) {
  const target = t >= 0 ? 255 : 0
  const amt = Math.abs(t)
  return Math.round(c + (target - c) * amt)
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

// tailwind.config.js's color functions read these as `rgb(var(--color-brand-600) / <alpha>)`,
// which needs space-separated channel numbers, not a hex string.
function toRgbTriple([r, g, b]) {
  return `${r} ${g} ${b}`
}

/** Full 50–900 Tailwind-style scale from one hex colour. */
export function buildShadeScale(baseHex) {
  const rgb = parseHex(baseHex)
  if (!rgb) return null
  return Object.fromEntries(
    SHADE_MIX.map(([shade, t]) => [shade, toHex(rgb.map((c) => mixChannel(c, t)))]),
  )
}

// Originals captured once so clearing restores exactly what index.html shipped
let originals = null
function captureOriginals() {
  if (originals) return
  const favicon = document.querySelector('link[rel="icon"]')
  const themeMeta = document.querySelector('meta[name="theme-color"]')
  originals = {
    title: document.title,
    faviconHref: favicon?.getAttribute('href') || null,
    themeColor: themeMeta?.getAttribute('content') || null,
  }
}

export function applyWhitelabelTheme(whitelabel) {
  if (!whitelabel?.enabled) {
    clearWhitelabelTheme()
    return
  }
  captureOriginals()
  const root = document.documentElement

  const scale = buildShadeScale(whitelabel.primary_color)
  if (scale) {
    for (const [shade, hex] of Object.entries(scale)) {
      root.style.setProperty(`--color-brand-${shade}`, toRgbTriple(parseHex(hex)))
    }
  }

  if (whitelabel.brand_name) {
    document.title = whitelabel.tagline
      ? `${whitelabel.brand_name} — ${whitelabel.tagline}`
      : whitelabel.brand_name
  }

  const iconUrl = whitelabel.favicon_url || whitelabel.logo_url
  const favicon = document.querySelector('link[rel="icon"]')
  if (iconUrl && favicon) favicon.setAttribute('href', iconUrl)

  const themeMeta = document.querySelector('meta[name="theme-color"]')
  if (scale && themeMeta) themeMeta.setAttribute('content', scale['800'])
}

export function clearWhitelabelTheme() {
  const root = document.documentElement
  for (const [shade] of SHADE_MIX) {
    root.style.removeProperty(`--color-brand-${shade}`)
  }
  if (!originals) return
  document.title = originals.title
  const favicon = document.querySelector('link[rel="icon"]')
  if (favicon && originals.faviconHref) favicon.setAttribute('href', originals.faviconHref)
  const themeMeta = document.querySelector('meta[name="theme-color"]')
  if (themeMeta && originals.themeColor) themeMeta.setAttribute('content', originals.themeColor)
}

/** Industry verticals a tenant can be tagged with — used for admin filtering
 *  today and as the hook for per-vertical presets later. */
export const INDUSTRIES = [
  { key: 'general_retail', label: 'General Retail' },
  { key: 'clothing', label: 'Clothing & Apparel' },
  { key: 'pharmacy', label: 'Pharmacy / Drug Store' },
  { key: 'fragrance', label: 'Fragrance & Cosmetics' },
  { key: 'gas_lp', label: 'LP Gas Retail' },
  { key: 'grocery', label: 'Grocery / Supermarket' },
  { key: 'restaurant', label: 'Restaurant / Food Service' },
  { key: 'electronics', label: 'Electronics & Gadgets' },
  { key: 'hardware', label: 'Hardware & Building' },
  { key: 'other', label: 'Other' },
]
