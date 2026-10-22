import { supabaseAdmin } from './supabaseAdmin.js'
import { getAppState } from './platformSecrets.js'
import { founderEmails } from './adminAuth.js'

// ---------------------------------------------------------------------------
// Cota e portão da Geração de Imagem/Vídeo (API oficial do Google). A chave é do
// DONO (custo do dono), então a cota é por USUÁRIO, por tipo (imagem e vídeo têm
// limites separados — vídeo é bem mais caro). Enforcement SERVER-SIDE.
//   Contagem: 1 imagem gerada = 1 na cota de imagem; 1 vídeo concluído = 1 na de
//   vídeo. O fundador é ilimitado.
// ---------------------------------------------------------------------------

const RANK = { FREE: 0, BASIC: 1, LITE: 2, PRO: 3, MASTER: 4 }
const DEFAULT_CONFIG = {
  enabled: false,
  imageLimit: 30,
  videoLimit: 5,
  minPlan: 'BASIC',
  imageModel: 'gemini-2.5-flash-image',
  videoModel: 'veo-3.1-generate-preview',
  maxConcurrentVideos: 3,
}

export async function getGenMediaConfig() {
  const raw = (await getAppState('genmedia_config', null)) || {}
  const cfg = { ...DEFAULT_CONFIG, ...raw }
  const int = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : d)
  cfg.imageLimit = int(cfg.imageLimit, 30)
  cfg.videoLimit = int(cfg.videoLimit, 5)
  cfg.maxConcurrentVideos = Math.max(1, int(cfg.maxConcurrentVideos, 3))
  cfg.minPlan = RANK[String(cfg.minPlan).toUpperCase()] !== undefined ? String(cfg.minPlan).toUpperCase() : 'BASIC'
  cfg.enabled = !!cfg.enabled
  cfg.imageModel = cfg.imageModel || DEFAULT_CONFIG.imageModel
  cfg.videoModel = cfg.videoModel || DEFAULT_CONFIG.videoModel
  return cfg
}

function today() {
  return new Date().toISOString().slice(0, 10)
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

const COL = { image: 'image_count', video: 'video_count' }

// Avalia se o usuário pode gerar AGORA um item do tipo `kind` ('image'|'video').
// Retorna: { authRequired } | { banned } | { planBlocked, plan, minPlan } |
//          { over, used, limit } | { ok, user, day, used, limit, remaining, unlimited, plan }
export async function checkGenMediaLimit(req, cfg, kind) {
  const supa = supabaseAdmin()
  if (!supa) return { authRequired: true, localMode: true }
  const user = await userFromReq(req, supa)
  if (!user) return { authRequired: true }
  if (user.banned_until && new Date(user.banned_until) > new Date()) return { banned: true }

  const email = (user.email || '').toLowerCase()
  const isFounder = founderEmails().includes(email)
  const plan = planOf(user, isFounder)
  if (!isFounder && (RANK[plan] ?? 0) < (RANK[cfg.minPlan] ?? 0)) return { planBlocked: true, plan, minPlan: cfg.minPlan, user }

  const day = today()
  if (isFounder) return { ok: true, user, day, used: 0, limit: Infinity, remaining: Infinity, unlimited: true, plan }

  const limit = kind === 'video' ? cfg.videoLimit : cfg.imageLimit
  const col = COL[kind]
  const { data: row } = await supa.from('genmedia_usage').select(col).eq('user_id', user.id).eq('day', day).maybeSingle()
  const used = Number(row?.[col]) || 0
  if (used >= limit) return { over: true, used, limit, user, day, plan }
  return { ok: true, user, day, used, limit, remaining: Math.max(0, limit - used), unlimited: false, plan }
}

// Soma 1 uso do tipo `kind` (após sucesso).
export async function recordGenMediaUse(user, day, kind) {
  const supa = supabaseAdmin()
  if (!supa || !user) return
  const d = day || today()
  const col = COL[kind]
  const { data: row } = await supa.from('genmedia_usage').select('image_count, video_count').eq('user_id', user.id).eq('day', d).maybeSingle()
  const base = { image_count: Number(row?.image_count) || 0, video_count: Number(row?.video_count) || 0 }
  base[col] += 1
  await supa.from('genmedia_usage').upsert({ user_id: user.id, day: d, ...base, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })
}

// Quantos vídeos deste usuário estão pendentes/processando (limita concorrência).
export async function countActiveVideoJobs(userId) {
  const supa = supabaseAdmin()
  if (!supa) return 0
  const { count } = await supa
    .from('media_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'video')
    .in('status', ['pending', 'processing'])
  return count || 0
}

export async function getDailyUsage(userId) {
  const supa = supabaseAdmin()
  if (!supa) return { image_count: 0, video_count: 0 }
  const { data } = await supa.from('genmedia_usage').select('image_count, video_count').eq('user_id', userId).eq('day', today()).maybeSingle()
  return { image_count: Number(data?.image_count) || 0, video_count: Number(data?.video_count) || 0 }
}
