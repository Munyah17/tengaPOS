import { createClient } from '@supabase/supabase-js'
import { isStaleJwtError } from './authRetry'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Allow fallback for production builds where env vars might be injected differently
const finalSupabaseUrl = supabaseUrl || 'https://placeholder.supabase.co'
const finalSupabaseAnonKey = supabaseAnonKey || 'placeholder-key'

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not found. Using fallback values - authentication may not work.')
}

// A session token minted before a JWT signing-key rotation fails
// verification on EVERY call identically, forever -- Supabase's own
// autoRefreshToken only refreshes based on expiry time, not on whether the
// signing key itself is still valid, so it never proactively replaces a
// token like this. Wrapped here at the fetch level (rather than patched
// into each of the many call sites across the app individually) so it
// covers every table query, RPC, Storage upload, and Edge Function call
// the client makes -- current and future -- in one place: on a JWT-
// signature-class 401/403, refresh the session once and transparently
// retry the exact same request before the error ever reaches application
// code. Concrete incident this fixes: a stale token made POS checkout
// fail identically on every attempt, which the app misread as a
// connectivity blip and queued offline forever, silently -- zero orders
// were ever recorded for the affected tenant until this was traced back.
let refreshInFlight = null
function getRefreshedAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = supabase.auth.refreshSession()
      .then(({ data, error }) => (error ? null : data.session?.access_token || null))
      .finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

async function resilientFetch(input, init = {}) {
  const res = await fetch(input, init)
  if (res.status !== 401 && res.status !== 403) return res

  // Never intercept Auth's own endpoints -- refreshSession() itself goes
  // through this same fetch, and a genuinely failed/expired refresh token
  // should surface as-is, not loop.
  const url = typeof input === 'string' ? input : input?.url || ''
  if (url.includes('/auth/v1/')) return res

  let bodyText = ''
  try { bodyText = await res.clone().text() } catch { /* ignore */ }
  if (!isStaleJwtError(bodyText)) return res

  const token = await getRefreshedAccessToken()
  if (!token) return res

  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

export const supabase = createClient(finalSupabaseUrl, finalSupabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  global: {
    fetch: resilientFetch,
  },
})
