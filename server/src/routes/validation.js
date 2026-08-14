import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { resolveAccess, emailByUserId } from './workspace.js'

// Validação de canal: critérios (padrão do workspace + override por canal),
// 4 olhares, tabela de teste e veredito. Uma validação por canal.
const router = Router()

// Critérios recomendados (o "método"). Servem de padrão quando o dono ainda não
// definiu um padrão de workspace nem um override no canal.
export const METHOD_DEFAULTS = {
  demandaDiasMin: 30,
  demandaDiasMax: 60,
  razaoMin: 1.0,
  portaSubs: 10000,
  portaViews: 100000,
  nVideos: 10,
  pisoCompetencia: 1000,
  pisoTracao: 3000,
}

// Só mantém as chaves conhecidas e numéricas (anti-lixo).
function cleanCriteria(c) {
  const out = {}
  for (const k of Object.keys(METHOD_DEFAULTS)) {
    if (c && c[k] != null && isFinite(Number(c[k]))) out[k] = Number(c[k])
  }
  return out
}

function requireSupabase(res) {
  const supa = supabaseAdmin()
  if (!supa) {
    res.status(400).json({ error: 'supabase_not_configured', message: 'Configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    return null
  }
  return supa
}

async function getUser(req, supa) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await supa.auth.getUser(token)
  return data?.user || null
}

// Padrão de critérios do workspace do próprio usuário.
async function loadWorkspaceDefaults(supa, ownerId) {
  const { data } = await supa.from('validation_workspace_defaults').select('criteria').eq('owner_id', ownerId).maybeSingle()
  return { ...METHOD_DEFAULTS, ...(data?.criteria || {}) }
}

// GET /api/validation/defaults — padrão de critérios do MEU workspace.
router.get('/defaults', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const criteria = await loadWorkspaceDefaults(supa, user.id)
  res.json({ criteria, method: METHOD_DEFAULTS })
})

// PUT /api/validation/defaults — salva o padrão do MEU workspace.
router.put('/defaults', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const criteria = cleanCriteria(req.body?.criteria)
  const { error } = await supa
    .from('validation_workspace_defaults')
    .upsert({ owner_id: user.id, criteria, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ criteria: { ...METHOD_DEFAULTS, ...criteria } })
})

// Resolve o acesso do usuário a um canal: devolve { channel, ownerId, isOwner,
// canEdit } ou null. O dono edita tudo; colaborador com acesso a vídeos vê, e
// com 'edit' também salva.
async function authorizeChannel(supa, user, channelId) {
  const { data: channel } = await supa.from('channels').select('id, owner_id').eq('id', channelId).maybeSingle()
  if (!channel) return { notFound: true }
  if (channel.owner_id === user.id) return { channel, ownerId: channel.owner_id, isOwner: true, canEdit: true }
  const ownerEmail = await emailByUserId(supa, channel.owner_id)
  const access = ownerEmail ? await resolveAccess(supa, user, ownerEmail) : null
  if (!access || access.videos === 'none') return { forbidden: true }
  // Escopo por canal: o nível vale POR CANAL. Sem escopo, usa o nível de vídeos.
  if (access.channelAccess) {
    const lvl = access.channelAccess[channelId]
    if (!lvl) return { forbidden: true } // canal fora do escopo do colaborador
    return { channel, ownerId: channel.owner_id, isOwner: false, canEdit: lvl === 'edit' }
  }
  return { channel, ownerId: channel.owner_id, isOwner: false, canEdit: access.videos === 'edit' }
}

function toClient(row, workspaceDefaults) {
  const override = row?.criteria_override || null
  return {
    criteria: { ...workspaceDefaults, ...(override || {}) },
    usesOverride: !!override,
    olhares: row?.olhares || {},
    test: Array.isArray(row?.test) ? row.test : [],
    deadline: row?.deadline || null,
    continuityRule: row?.continuity_rule || '',
    verdict: row?.verdict || null,
  }
}

// GET /api/validation/channel/:id — validação do canal (cria o registro vazio na 1ª vez).
router.get('/channel/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const auth = await authorizeChannel(supa, user, req.params.id)
  if (auth.notFound) return res.status(404).json({ error: 'not_found' })
  if (auth.forbidden) return res.status(403).json({ error: 'forbidden' })
  const defaults = await loadWorkspaceDefaults(supa, auth.ownerId)
  const { data: row } = await supa.from('channel_validations').select('*').eq('channel_id', req.params.id).maybeSingle()
  res.json({ validation: toClient(row, defaults), workspaceDefaults: defaults, method: METHOD_DEFAULTS, canEdit: auth.canEdit })
})

// PUT /api/validation/channel/:id — salva a validação do canal.
router.put('/channel/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const auth = await authorizeChannel(supa, user, req.params.id)
  if (auth.notFound) return res.status(404).json({ error: 'not_found' })
  if (auth.forbidden || !auth.canEdit) return res.status(403).json({ error: 'forbidden' })
  const b = req.body || {}
  const row = {
    channel_id: req.params.id,
    owner_id: auth.ownerId,
    // override null = herda o padrão do workspace (o cliente manda null quando "usar padrão")
    criteria_override: b.criteriaOverride ? cleanCriteria(b.criteriaOverride) : null,
    deadline: b.deadline || null,
    continuity_rule: typeof b.continuityRule === 'string' ? b.continuityRule.slice(0, 500) : '',
    olhares: b.olhares && typeof b.olhares === 'object' ? b.olhares : {},
    test: Array.isArray(b.test) ? b.test.slice(0, 50) : [],
    verdict: b.verdict ? String(b.verdict).slice(0, 40) : null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supa.from('channel_validations').upsert(row, { onConflict: 'channel_id' })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  const defaults = await loadWorkspaceDefaults(supa, auth.ownerId)
  const { data: saved } = await supa.from('channel_validations').select('*').eq('channel_id', req.params.id).maybeSingle()
  res.json({ validation: toClient(saved, defaults) })
})

export default router
