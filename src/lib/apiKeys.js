// Helpers for issuing tengaPOS Public API keys from the Super Admin portal.
//
// Raw keys are generated here, shown to the Super Admin exactly once, and
// never stored — only the SHA-256 hash is persisted in public.api_keys.
// The public-api edge function re-hashes presented keys to authenticate.

// Crockford-ish base32 without ambiguous characters — URL-safe and easy to
// read out over a phone when onboarding a developer.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomToken(length) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

export async function sha256hex(input) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Returns { rawKey, publicId, keyHash, last4 }.
//   rawKey   — the full secret, shown once then discarded
//   publicId — short identifier stored in clear for lookup/display
//   keyHash  — sha256 hex, the only auth material we persist
export async function generateApiKey(keyType) {
  const prefix = keyType === 'publishable' ? 'tpos_pk_' : 'tpos_sk_'
  const publicId = `${prefix}${randomToken(8)}`
  const secret = randomToken(keyType === 'publishable' ? 24 : 32)
  const rawKey = `${publicId}${secret}`
  const keyHash = await sha256hex(rawKey)
  return { rawKey, publicId, keyHash, last4: rawKey.slice(-4) }
}

export const API_SCOPES = [
  { id: 'account:read',    label: 'Account info',        write: false, publishable: true },
  { id: 'branches:read',   label: 'Branches',            write: false, publishable: true },
  { id: 'categories:read', label: 'Categories',          write: false, publishable: true },
  { id: 'products:read',   label: 'Products',            write: false, publishable: true },
  { id: 'stock:read',      label: 'Stock levels',        write: false, publishable: true },
  { id: 'customers:read',  label: 'Customers (read)',    write: false, publishable: false },
  { id: 'customers:write', label: 'Customers (create)',  write: true,  publishable: false },
  { id: 'sales:read',      label: 'Sales / receipts',    write: false, publishable: false },
  { id: 'orders:read',     label: 'Orders',              write: false, publishable: false },
  { id: 'invoices:read',   label: 'Invoices & quotes',   write: false, publishable: false },
  { id: 'invoices:write',  label: 'Invoices (create)',   write: true,  publishable: false },
]
