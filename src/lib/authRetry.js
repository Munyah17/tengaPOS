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
