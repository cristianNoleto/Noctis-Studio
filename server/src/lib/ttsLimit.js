import { supabaseAdmin } from './supabaseAdmin.js'
import { getAppState } from './platformSecrets.js'
import { founderEmails } from './adminAuth.js'

// ---------------------------------------------------------------------------
// Cota e portão da Narração (ElevenLabs). A chave é do DONO (custo do dono),
// então a cota é por USUÁRIO e configurável (padrão 30 áudios/dia). Regra de
// contagem: 1 geração bem-sucedida = 1 áudio, independente do tamanho do texto.
// O fundador é ilimitado. O enforcement é SERVER-SIDE (não dá para burlar).
// ---------------------------------------------------------------------------

const RANK = { FREE: 0, BASIC: 1, LITE: 2, PRO: 3, MASTER: 4 }
const DEFAULT_CONFIG = { enabled: false, dailyLimit: 30, minPlan: 'BASIC', modelId: 'eleven_multilingual_v2' }

export async function getTtsConfig() {
  const raw = (await getAppState('tts_config', null)) || {}
  const cfg = { ...DEFAULT_CONFIG, ...raw }
  cfg.dailyLimit = Number.isFinite(Number(cfg.dailyLimit)) ? Math.max(0, Math.floor(Number(cfg.dailyLimit))) : 30
  cfg.minPlan = RANK[String(cfg.minPlan).toUpperCase()] !== undefined ? String(cfg.minPlan).toUpperCase() : 'BASIC'
  cfg.enabled = !!cfg.enabled
  cfg.modelId = cfg.modelId || 'eleven_multilingual_v2'
  return cfg
}

function today() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

async function userFromReq(req, supa) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await supa.auth.getUser(token)
  return data?.user || null
}

function planOf(user, isFounder) {
  if (isFounder) return 'MASTER'
  return user.app_metadata?.plan || 'FREE'
}

// Avalia se o usuário do token pode gerar um áudio AGORA. Retorna um objeto com:
//   { authRequired }                          → exigir login
//   { planBlocked, plan, minPlan }            → plano insuficiente
//   { over, used, limit }                     → cota do dia estourada
//   { ok:true, user, day, used, limit, remaining, unlimited, plan }  → pode gerar
export async function checkTtsLimit(req, cfg) {
  const supa = supabaseAdmin()
  if (!supa) return { authRequired: true, localMode: true } // sem identidade não há como cobrar/contar
  const user = await userFromReq(req, supa)
  if (!user) return { authRequired: true }
  if (user.banned_until && new Date(user.banned_until) > new Date()) return { banned: true }

  const email = (user.email || '').toLowerCase()
  const isFounder = founderEmails().includes(email)
  const plan = planOf(user, isFounder)

  if (!isFounder && (RANK[plan] ?? 0) < (RANK[cfg.minPlan] ?? 0)) {
    return { planBlocked: true, plan, minPlan: cfg.minPlan, user }
  }

  const day = today()
  if (isFounder) return { ok: true, user, day, used: 0, limit: Infinity, remaining: Infinity, unlimited: true, plan }

  const limit = cfg.dailyLimit
  const { data: row } = await supa.from('tts_usage').select('count').eq('user_id', user.id).eq('day', day).maybeSingle()
  const used = Number(row?.count) || 0
  if (used >= limit) return { over: true, used, limit, user, day, plan }
  return { ok: true, user, day, used, limit, remaining: Math.max(0, limit - used), unlimited: false, plan }
}

// Soma 1 uso (após a geração dar certo).
export async function recordTtsUse(user, day) {
  const supa = supabaseAdmin()
  if (!supa || !user) return
  const d = day || today()
  const { data: row } = await supa.from('tts_usage').select('count').eq('user_id', user.id).eq('day', d).maybeSingle()
  const count = (Number(row?.count) || 0) + 1
  await supa.from('tts_usage').upsert({ user_id: user.id, day: d, count, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })
}
