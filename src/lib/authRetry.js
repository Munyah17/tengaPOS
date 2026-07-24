// A session token minted before a JWT signing-key rotation fails signature
// verification everywhere it's checked -- Edge Functions ("invalid JWT ...
// unrecognized JWT kid"), and PostgREST/RPC calls too (JWSError /
// JWSInvalidSignature / "invalid signature" / PGRST301). Supabase's client
// autoRefreshToken only refreshes based on *expiry time*, so a token that
// isn't expired yet but was signed under a now-retired key is never
// proactively replaced. The actual refresh-and-retry lives in
// src/lib/supabase.js's fetch wrapper, which covers every REST/RPC/Storage/
// Edge Function call the client makes in one place -- this is just the
// shared detector both that wrapper and any call site's own error
// messaging can use.
export function isStaleJwtError(msg) {
  return typeof msg === 'string' &&
    /invalid jwt|unrecognized jwt kid|token is unverifiable|jwsinvalidsignature|jwserror|invalid signature|pgrst301/i.test(msg)
}
