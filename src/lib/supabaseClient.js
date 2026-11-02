import { createClient } from '@supabase/supabase-js'

const env = import.meta.env ?? {}
const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim()
const supabasePublishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
    },
  })
  : null
