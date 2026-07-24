import { supabase } from './supabase'

// Central helper for calling Supabase Edge Functions with the caller's
// session token. A session token minted before a JWT signing-key rotation
// fails verification at the gateway with "invalid JWT ... unrecognized
// JWT kid" -- not something retrying with the SAME token fixes. This
// refreshes the session once and retries transparently instead of
// surfacing that error to the user.
function isStaleJwtError(msg) {
  return typeof msg === 'string' && /invalid jwt|unrecognized jwt kid|token is unverifiable/i.test(msg)
}

export async function invokeEdgeFunction(name, body, { retried = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })
  if (error) {
    let msg = error.message
    try {
      const ctx = await error.context?.json()
      if (ctx?.error) msg = ctx.error
    } catch { /* keep default */ }
    if (!retried && isStaleJwtError(msg)) {
      const { error: refreshErr } = await supabase.auth.refreshSession()
      if (!refreshErr) return invokeEdgeFunction(name, body, { retried: true })
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
