import { createClient } from '@supabase/supabase-js'

// Cliente Supabase com a SERVICE ROLE (bypassa RLS) — só existe no servidor.
// Usado para escrever/ler a base global de canais do Niche Finder (niche_channels).
// As envs já estão na Vercel: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
let client = null
export function supabaseAdmin() {
  if (client) return client
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}
