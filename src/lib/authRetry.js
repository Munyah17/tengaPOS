// A session token minted before a JWT signing-key rotation fails signature
// verification everywhere it's checked -- Edge Functions ("invalid JWT ...
// unrecognized JWT kid"), and PostgREST/RPC calls too (JWSError /
// JWSInvalidSignature / "invalid signature" / PGRST301). Supabase's client
// autoRefreshToken only refreshes based on *expiry time*, so a token that
// isn't expired yet but was signed under a now-retired key is never
// proactively replaced -- every call using it keeps failing identically
// until something forces a refresh. This detects that error class so
// callers can refresh once and retry instead of treating it as a generic
// failure (or, worse, a "connection issue" to be queued and retried
// forever with the same stale token — see src/lib/offlineSync.js).
export function isStaleJwtError(msg) {
  return typeof msg === 'string' &&
    /invalid jwt|unrecognized jwt kid|token is unverifiable|jwsinvalidsignature|jwserror|invalid signature|pgrst301|not authorized for this tenant/i.test(msg)
}

export async function refreshSessionOnce(supabase) {
  const { error } = await supabase.auth.refreshSession()
  return !error
}

// Distinguishes an actual connectivity failure (request never reached the
// server, or never got a response) from a real server-side error (bad input,
// auth/authorization failure, business-rule rejection). This matters because
// callers like POS checkout use it to decide whether to queue the sale for
// offline sync — every other kind of error should surface to the user
// immediately instead of being silently queued and retried forever with the
// same bad request (see the "operating offline by default" bug: any server
// error, e.g. a stale session past its one JWT-refresh retry, was being
// treated identically to a dropped connection).
export function isNetworkError(err) {
  if (!err) return false
  // A Postgres/PostgREST error always carries a `code` (SQLSTATE or PGRST*)
  // — the request reached the server and was rejected/failed there, which is
  // never a connectivity problem, whatever the message says.
  if (err.code) return false
  const msg = String(err.message || '')
  return /failed to fetch|networkerror|network request failed|load failed|timeout|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|ERR_CONNECTION/i.test(msg)
}
