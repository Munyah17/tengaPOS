import { supabase } from './supabase'
import { isStaleJwtError, refreshSessionOnce } from './authRetry'

// Central helper for calling Supabase Edge Functions with the caller's
// session token. See authRetry.js for why a stale-signing-key token needs
// an explicit refresh-and-retry instead of being treated as a normal error.
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
    if (!retried && isStaleJwtError(msg) && await refreshSessionOnce(supabase)) {
      return invokeEdgeFunction(name, body, { retried: true })
    }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
