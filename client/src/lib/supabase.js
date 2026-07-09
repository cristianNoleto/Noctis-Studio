import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sem credenciais configuradas o app roda em "modo local": a autenticação é
// simulada em localStorage para permitir desenvolvimento/preview sem projeto
// Supabase provisionado. Configure client/.env para ativar o modo real.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
export const isLocalMode = !supabase
