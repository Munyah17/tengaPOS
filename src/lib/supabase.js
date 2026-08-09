import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Allow fallback for production builds where env vars might be injected differently
const finalSupabaseUrl = supabaseUrl || 'https://placeholder.supabase.co'
const finalSupabaseAnonKey = supabaseAnonKey || 'placeholder-key'

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not found. Using fallback values - authentication may not work.')
}

// "View as Tenant" (AdminTenants.jsx) needs this ONE browser tab to hold a
// genuinely separate auth session from every other tab on the same
// machine. supabase-js's persistSession writes to a single localStorage
// key and every client sharing that key listens for changes to it, so any
// OTHER open tab (a cashier's login left open on the same support
// workstation, say) picked up the swapped-in session the instant an admin
// clicked "View as Tenant" elsewhere -- and got signed out moments later
// when authStore's validateSession() noticed its cached identity no
// longer matched. Reported live as cashiers/new clients "randomly" losing
// their session. Giving the impersonating tab its own storage key removes
// it from that shared pool entirely -- see authStore.js's initAuth() for
// the one-time handoff that populates it after the flag is set.
const IMPERSONATION_FLAG = 'tengapos_impersonation_mode'
const isImpersonating = typeof window !== 'undefined' && sessionStorage.getItem(IMPERSONATION_FLAG) === '1'
const MAIN_STORAGE_KEY = 'sb-tengapos-main-auth'

// One-time migration, main sessions only: every already-signed-in browser
// has its session sitting under supabase-js's own default key (derived
// from the project ref), not the explicit one above -- without this,
// shipping the explicit key would silently sign out every currently
// logged-in cashier/vendor/admin on deploy, which is exactly the kind of
// disruption this whole change is meant to stop causing. Copies the value
// across (never deletes the original) and only runs when the new key is
// still empty, so it's a no-op on every later load.
if (!isImpersonating && typeof window !== 'undefined') {
  try {
    if (!localStorage.getItem(MAIN_STORAGE_KEY)) {
      const legacyKey = `sb-${new URL(finalSupabaseUrl).hostname.split('.')[0]}-auth-token`
      const legacyValue = localStorage.getItem(legacyKey)
      if (legacyValue) localStorage.setItem(MAIN_STORAGE_KEY, legacyValue)
    }
  } catch { /* localStorage unavailable (private mode, etc.) -- fall through, normal sign-in still works */ }
}

export const supabase = createClient(finalSupabaseUrl, finalSupabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: isImpersonating ? 'sb-tengapos-impersonation-auth' : MAIN_STORAGE_KEY,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})
