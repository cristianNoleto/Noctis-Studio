import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Colaboradores do workspace — o dono (fundador ou plano MASTER) libera o
// acesso às suas skills "workspace" e referências para outro e-mail.
const router = Router()

function requireSupabase(res) {
  const supa = supabaseAdmin()
  if (!supa) {
    res.status(400).json({ error: 'supabase_not_configured', message: 'Configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    return null
  }
  return supa
}

function founderEmails() {
  return (process.env.FOUNDER_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

async function getViewer(req, supa) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return { email: '', plan: 'FREE', isFounder: false }
  const { data } = await supa.auth.getUser(token)
  const email = (data?.user?.email || '').toLowerCase()
  const plan = data?.user?.app_metadata?.plan || 'FREE'
  return { email, plan, isFounder: !!email && founderEmails().includes(email) }
}

// Adicionar colaboradores: fundador ou plano Pro (MASTER = legado do fundador).
function canManage(v) {
  return v.isFounder || v.plan === 'PRO' || v.plan === 'MASTER'
}

// Já existe conta com esse e-mail? (base pequena → listUsers)
async function userExists(supa, email) {
  const e = (email || '').toLowerCase()
  const { data } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return (data?.users || []).some((u) => (u.email || '').toLowerCase() === e)
}

const ACCESS = ['none', 'view', 'edit']

function toClient(r) {
  return { id: r.id, memberEmail: r.member_email, skills: r.skills || 'none', references: r.references_access || 'none', videos: r.videos_access || 'none', board: r.board_access || 'none', drawings: r.drawings_access || 'none', channelIds: Array.isArray(r.channel_ids) ? r.channel_ids : null }
}

// Normaliza a lista de canais: só UUIDs; vazio → null (= todos os canais).
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
function cleanChannelIds(v) {
  if (!Array.isArray(v)) return null
  const ids = [...new Set(v.filter(isUuid))]
  return ids.length ? ids : null
}

// GET /collaborators — os colaboradores do usuário logado (como dono)
router.get('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await getViewer(req, supa)
  if (!viewer.email) return res.status(401).json({ error: 'unauthorized' })
  const { data, error } = await supa.from('workspace_collaborators').select('*').eq('owner_email', viewer.email).order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ collaborators: (data || []).map(toClient) })
})

// POST /collaborators/save — cria/atualiza (dono, fundador ou MASTER)
router.post('/save', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await getViewer(req, supa)
  if (!viewer.email) return res.status(401).json({ error: 'unauthorized' })
  if (!canManage(viewer)) return res.status(403).json({ error: 'forbidden', message: 'Apenas o fundador e o plano mais caro liberam colaboradores.' })
  const c = req.body?.collaborator || {}
  const member = String(c.memberEmail || '').toLowerCase().trim()
  if (!member.includes('@')) return res.status(400).json({ error: 'invalid_email' })
  const skills = ACCESS.includes(c.skills) ? c.skills : 'view'
  const references = ACCESS.includes(c.references) ? c.references : 'none'
  const videos = ACCESS.includes(c.videos) ? c.videos : 'view'
  const board = ACCESS.includes(c.board) ? c.board : 'none'
  const drawings = ACCESS.includes(c.drawings) ? c.drawings : 'none'
  const channelIds = cleanChannelIds(c.channelIds)
  const row = { owner_email: viewer.email, member_email: member, skills, references_access: references, videos_access: videos, board_access: board, drawings_access: drawings, channel_ids: channelIds }
  // upsert por (owner_email, member_email)
  const { data, error } = await supa
    .from('workspace_collaborators')
    .upsert(row, { onConflict: 'owner_email,member_email' })
    .select()
    .single()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })

  // Se a pessoa ainda não tem conta, envia o convite por e-mail (link de aceite
  // → tela de criar senha). Não bloqueia o salvamento se o e-mail falhar.
  let invited = false
  try {
    if (!(await userExists(supa, member))) {
      const origin = req.headers.origin || process.env.APP_URL || ''
      await supa.auth.admin.inviteUserByEmail(member, origin ? { redirectTo: `${origin}/aceitar-convite` } : undefined)
      invited = true
    }
  } catch {
    /* e-mail não configurado / limite atingido → segue sem travar */
  }
  res.json({ collaborator: toClient(data), invited })
})

// Área do item -> coluna de acesso do colaborador.
const AREA_COL = { references: 'references_access', board: 'board_access', drawings: 'drawings_access', skills: 'skills', videos: 'videos_access' }

// POST /collaborators/grant — usado pelo campo "usuários específicos": ao liberar
// um item para um e-mail, garante que a pessoa é colaboradora COM acesso (view)
// à área daquele item, e — se ainda não tiver conta — dispara o convite. Não
// rebaixa acessos existentes (só sobe de 'none' para 'view').
router.post('/grant', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await getViewer(req, supa)
  if (!viewer.email) return res.status(401).json({ error: 'unauthorized' })
  if (!canManage(viewer)) return res.status(403).json({ error: 'forbidden', message: 'Apenas o fundador e o plano mais caro liberam colaboradores.' })
  const member = String(req.body?.email || '').toLowerCase().trim()
  const col = AREA_COL[req.body?.area]
  if (!member.includes('@')) return res.status(400).json({ error: 'invalid_email' })
  if (!col) return res.status(400).json({ error: 'invalid_area' })

  // Já é colaborador? Só sobe a área para 'view' se estiver 'none'; preserva o resto.
  const { data: existing } = await supa.from('workspace_collaborators').select('*').eq('owner_email', viewer.email).eq('member_email', member).maybeSingle()
  const base = existing || { owner_email: viewer.email, member_email: member, skills: 'none', references_access: 'none', videos_access: 'none', board_access: 'none', drawings_access: 'none', channel_ids: null }
  if (!base[col] || base[col] === 'none') base[col] = 'view'
  const { id, created_at, ...row } = base
  const { data, error } = await supa.from('workspace_collaborators').upsert(row, { onConflict: 'owner_email,member_email' }).select().single()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })

  let invited = false
  let hasAccount = true
  try {
    hasAccount = await userExists(supa, member)
    if (!hasAccount) {
      const origin = req.headers.origin || process.env.APP_URL || ''
      await supa.auth.admin.inviteUserByEmail(member, origin ? { redirectTo: `${origin}/aceitar-convite` } : undefined)
      invited = true
    }
  } catch {
    /* e-mail não configurado / limite → segue sem travar */
  }
  res.json({ collaborator: toClient(data), invited, hasAccount })
})

// DELETE /collaborators/:id — remove (só o dono)
router.delete('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await getViewer(req, supa)
  if (!viewer.email) return res.status(401).json({ error: 'unauthorized' })
  const { error } = await supa.from('workspace_collaborators').delete().eq('id', req.params.id).eq('owner_email', viewer.email)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

export default router
