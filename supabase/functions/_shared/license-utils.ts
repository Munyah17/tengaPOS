// Shared pure helpers for the desktop-license edge function.
// No Deno-only or npm imports — this file must also run under Node
// (vitest) so the same canonicalization/semver/rollout logic the
// server uses is what the tests verify.

/** Canonical JSON per contract §1: sorted keys recursively, compact. */
export function canonicalize(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']'
  const o = v as Record<string, unknown>
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonicalize(o[k])).join(',') + '}'
}

/** -1/0/1 semver compare on x.y.z (missing segments treated as 0). */
export function semverCmp(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1
  }
  return 0
}

/** sha256 hex digest of a string or bytes. */
export async function sha256hex(data: string | Uint8Array): Promise<string> {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const h = await crypto.subtle.digest('SHA-256', buf as BufferSource)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** sha256 base64 digest of a string. */
export async function sha256b64(data: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return b64encode(new Uint8Array(h))
}

/** Deterministic rollout bucket per contract §2.5:
 *  uint32(first 4 bytes of sha256(device_id || version)) mod 100 → 0..99 */
export async function rolloutBucket(deviceId: string, version: string): Promise<number> {
  const hex = await sha256hex(deviceId + version)
  return parseInt(hex.slice(0, 8), 16) % 100
}

/** Crockford-ish activation code: TGA-XXXX-XXXX, unambiguous alphabet. */
export function generateCode(rand: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(8))): string {
  const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
  const bytes = rand()
  let raw = ''
  for (const b of bytes) raw += ALPHABET[b % ALPHABET.length]
  return `TGA-${raw.slice(0, 4)}-${raw.slice(4)}`
}

export function b64encode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
export function b64decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
export function hexToB64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return b64encode(bytes)
}
