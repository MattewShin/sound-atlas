import { createClient } from '@supabase/supabase-js'

const env = import.meta.env ?? {}
const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim()
const supabasePublishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
    },
  })
  : null
