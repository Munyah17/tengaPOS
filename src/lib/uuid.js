// crypto.randomUUID() needs a secure context and a recent-ish browser
// (Chrome 92+/equivalent) — unavailable on some older Android WebViews and
// non-HTTPS embeds. The old fallback here (`${Date.now()}-${Math.random()
// .toString(36)}`) produced a value that LOOKS like an opaque ID but isn't a
// UUID at all (base36 output can contain any of a-z, so e.g. "v" turns up
// constantly) — every checkout on an affected device broke with "invalid
// input syntax for type uuid" the moment that value hit process_checkout's
// p_client_ref column. This always returns a real, validly-formatted UUID v4
// (not cryptographically random when falling back, but a dedup key doesn't
// need to be — it only needs to be a UUID and collision-rare).
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
