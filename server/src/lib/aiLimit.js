import { supabaseAdmin } from './supabaseAdmin.js'

// Enforcement SERVER-SIDE do limite diário de IA por plano. O cliente também
// mostra o limite (UX), mas aqui é a trava real — não dá para burlar por dev
// tools. A IA é BYOK (chaves do próprio usuário), então o limite é um recurso de
// PLANO, não um custo nosso.
//
// Limites: FREE 2, BASIC 8, LITE 20 por dia. PRO/MASTER/fundador = ilimitado.

const AI_DAILY_LIMIT = { FREE: 2, BASIC: 8, LITE: 20 }

function founderEmails() {
  return (process.env.FOUNDER_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

function aiLimitFor(plan, isFounder) {
  if (isFounder || plan === 'PRO' || plan === 'MASTER') return Infinity
  return AI_DAILY_LIMIT[plan] ?? AI_DAILY_LIMIT.FREE
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

// Verifica se o usuário do token ainda pode usar IA hoje. Retorna:
//   { ok: true, over: false, user, day, limit, used, unlimited }  → pode
//   { ok: true, over: true, limit, used }                         → estourou (bloquear)
// Em modo local/sem service key ou sem token, libera (não há identidade p/ contar).
export async function checkAiLimit(req) {
  const supa = supabaseAdmin()
  if (!supa) return { ok: true, over: false } // modo local (sem service key) → sem identidade, libera
  const user = await userFromReq(req, supa)
  // Com o Supabase configurado (produção), exigir login: sem isso um usuário FREE
  // burlaria o limite diário só NÃO enviando o token. Rotas de IA tratam authRequired.
  if (!user) return { ok: true, over: false, authRequired: true }
  const email = (user.email || '').toLowerCase()
  const plan = user.app_metadata?.plan || 'FREE'
  const isFounder = founderEmails().includes(email)
  const limit = aiLimitFor(plan, isFounder)
  const day = today()
  if (!isFinite(limit)) return { ok: true, over: false, user, day, limit, used: 0, unlimited: true }
  const { data: row } = await supa.from('ai_usage').select('count').eq('user_id', user.id).eq('day', day).maybeSingle()
  const used = Number(row?.count) || 0
  if (used >= limit) return { ok: true, over: true, user, day, limit, used }
  return { ok: true, over: false, user, day, limit, used, unlimited: false }
}

// Registra 1 uso de IA (após uma geração bem-sucedida). Idempotência não é crítica:
// o objetivo é contar tentativas bem-sucedidas.
export async function recordAiUse(user, day) {
  const supa = supabaseAdmin()
  if (!supa || !user) return
  const d = day || today()
  const { data: row } = await supa.from('ai_usage').select('count').eq('user_id', user.id).eq('day', d).maybeSingle()
  const count = (Number(row?.count) || 0) + 1
  await supa.from('ai_usage').upsert({ user_id: user.id, day: d, count, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })
}
