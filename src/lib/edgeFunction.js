import { supabase } from './supabase'

// Central helper for calling Supabase Edge Functions with the caller's
// session token. Stale-signing-key retry is handled transparently at the
// fetch layer (see supabase.js) -- this just standardizes error parsing
// (functions.invoke() buries the real message in error.context, and the
// function's own body can carry a {error} even on a 200) so call sites
// don't each reimplement the same unwrapping.
export async function invokeEdgeFunction(name, body) {
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
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
