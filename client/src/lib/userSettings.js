import { supabase } from './supabase'
import { db } from './db'

// ---------------------------------------------------------------------------
// Sincronização das chaves de API por usuário no servidor (Supabase).
// As chaves continuam salvas no dispositivo (db/localStorage, usadas via BYOK
// nos headers), MAS também sobem para a tabela `user_settings` protegida por
// RLS (cada usuário só enxerga a própria linha). Assim, ao trocar de navegador
// ou dispositivo, as chaves são baixadas de volta automaticamente no login.
// A SERVICE ROLE nunca entra aqui — é o cliente anônimo + sessão do usuário.
// ---------------------------------------------------------------------------

// Configurações sincronizadas entre dispositivos (chaves BYOK + preferências de IA).
const SYNC_KEYS = ['ytKeys', 'geminiKey', 'geminiModel', 'aiProvider', 'groqKey', 'assemblyKey', 'pexelsKey', 'pixabayKey']

async function currentUserId() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data?.user?.id || null
}

// Envia as chaves atuais do dispositivo para o servidor (chamar ao salvar).
export async function pushUserSettings() {
  const uid = await currentUserId()
  if (!uid) return
  const keys = {}
  for (const k of SYNC_KEYS) {
    const v = db.getSetting(k)
    if (v !== undefined && v !== null && v !== '') keys[k] = v
  }
  await supabase.from('user_settings').upsert({ user_id: uid, keys, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
}

// Baixa as chaves do servidor para o dispositivo (chamar no login).
// Só escreve chaves que ainda não existem localmente OU que estejam vazias,
// para não sobrescrever algo que o usuário acabou de digitar neste navegador.
export async function pullUserSettings() {
  const uid = await currentUserId()
  if (!uid) return false
  const { data, error } = await supabase.from('user_settings').select('keys').eq('user_id', uid).maybeSingle()
  if (error || !data?.keys) return false
  let changed = false
  for (const k of SYNC_KEYS) {
    const remote = data.keys[k]
    if (remote === undefined || remote === null || remote === '') continue
    const local = db.getSetting(k)
    const localEmpty = local === undefined || local === null || local === '' || (Array.isArray(local) && local.filter(Boolean).length === 0)
    if (localEmpty) {
      db.setSetting(k, remote)
      changed = true
    }
  }
  return changed
}
