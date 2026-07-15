import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Allow fallback for production builds where env vars might be injected differently
const finalSupabaseUrl = supabaseUrl || 'https://placeholder.supabase.co'
const finalSupabaseAnonKey = supabaseAnonKey || 'placeholder-key'

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not found. Using fallback values - authentication may not work.')
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
})
