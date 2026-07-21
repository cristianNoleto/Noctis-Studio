import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Biblioteca de Skills do sistema — catálogo global.
// Leitura: pública (qualquer usuário logado no site).
// Escrita: SOMENTE o fundador (FOUNDER_EMAIL), validado pelo token JWT.
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

// Identifica o usuário pelo token (opcional). Devolve email/plano/isFounder.
async function getViewer(req, supa) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return { email: '', plan: 'FREE', isFounder: false }
  const { data } = await supa.auth.getUser(token)
  const email = (data?.user?.email || '').toLowerCase()
  const plan = data?.user?.app_metadata?.plan || 'FREE'
  return { email, plan, isFounder: !!email && founderEmails().includes(email) }
}

// Pode criar/editar skills: fundador OU plano mais caro (MASTER).
async function requireCreator(req, res, supa) {
  const viewer = await getViewer(req, supa)
  if (!viewer.email) {
    res.status(401).json({ error: 'unauthorized', message: 'Faça login para gerenciar as skills.' })
    return null
  }
  if (!viewer.isFounder && viewer.plan !== 'MASTER') {
    res.status(403).json({ error: 'forbidden', message: 'Apenas o fundador e o plano mais caro podem criar skills.' })
    return null
  }
  return viewer
}

// Donos de workspace em que o email é colaborador com acesso a skills.
async function skillWorkspaceOwners(supa, email) {
  if (!email) return new Set()
  const { data } = await supa.from('workspace_collaborators').select('owner_email, skills').eq('member_email', email)
  return new Set((data || []).filter((c) => c.skills && c.skills !== 'none').map((c) => (c.owner_email || '').toLowerCase()))
}

function canSeeRow(r, viewer, owners) {
  if (viewer.isFounder) return true
  const vis = r.visibility || 'global'
  const owner = (r.owner_email || '').toLowerCase()
  if (owner && owner === viewer.email) return true
  if (vis === 'global') return true
  if (vis === 'only_me') return false
  if (vis === 'specific') return (r.allowed_emails || []).map((e) => String(e).toLowerCase()).includes(viewer.email)
  if (vis === 'workspace') return owners.has(owner)
  return false
}

function toClient(r) {
  // Compat: skills antigas com image_url única viram um item de media.
  const media = Array.isArray(r.media) && r.media.length
    ? r.media
    : r.image_url
      ? [{ type: 'image', url: r.image_url, caption: '' }]
      : []
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    description: r.description || '',
    howToUse: r.how_to_use || '',
    content: r.content || '',
    videoUrl: r.video_url || '',
    media,
    ownerEmail: r.owner_email || '',
    visibility: r.visibility || 'global',
    allowedEmails: Array.isArray(r.allowed_emails) ? r.allowed_emails : [],
    copies: Number(r.copies) || 0,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
  }
}

function sanitizeMedia(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((m) => m && (m.type === 'image' || m.type === 'video') && typeof m.url === 'string' && m.url.startsWith('data:'))
    .slice(0, 10)
    .map((m) => ({ type: m.type, url: m.url, caption: String(m.caption || '').slice(0, 140) }))
}

// GET /skills — lista as skills que o usuário do token pode ver
router.get('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await getViewer(req, supa)
  const { data, error } = await supa.from('system_skills').select('*').order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  let rows = data || []
  if (!viewer.isFounder) {
    const owners = await skillWorkspaceOwners(supa, viewer.email)
    rows = rows.filter((r) => canSeeRow(r, viewer, owners))
  }
  res.json({ skills: rows.map(toClient) })
})

// POST /skills/save — cria/atualiza (fundador ou plano MASTER; dono só a sua)
router.post('/save', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await requireCreator(req, res, supa)
  if (!viewer) return
  const s = req.body?.skill || {}
  if (!s.title?.trim() || !['generation', 'visual', 'camera'].includes(s.category)) {
    return res.status(400).json({ error: 'invalid_skill', message: 'Título e categoria são obrigatórios.' })
  }
  // Não-fundador não pode editar skill de outro dono.
  if (s.id && !viewer.isFounder) {
    const { data: existing } = await supa.from('system_skills').select('owner_email').eq('id', s.id).single()
    if (!existing || (existing.owner_email || '').toLowerCase() !== viewer.email) {
      return res.status(403).json({ error: 'forbidden', message: 'Você só pode editar as suas skills.' })
    }
  }
  let visibility = ['global', 'workspace', 'specific', 'only_me'].includes(s.visibility) ? s.visibility : 'global'
  if (!viewer.isFounder && visibility === 'global') visibility = 'workspace' // só fundador publica no global
  const allowed =
    visibility === 'specific' && Array.isArray(s.allowedEmails)
      ? [...new Set(s.allowedEmails.map((e) => String(e).toLowerCase().trim()).filter((e) => e.includes('@')))].slice(0, 50)
      : []
  const row = {
    category: s.category,
    title: s.title.trim(),
    description: s.description || '',
    how_to_use: s.howToUse || '',
    content: s.content || '',
    video_url: s.videoUrl || '',
    media: sanitizeMedia(s.media),
    visibility,
    allowed_emails: allowed,
    updated_at: new Date().toISOString(),
  }
  if (!s.id) row.owner_email = viewer.email // dono definido só na criação
  const query = s.id
    ? supa.from('system_skills').update(row).eq('id', s.id).select().single()
    : supa.from('system_skills').insert(row).select().single()
  const { data, error } = await query
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ skill: toClient(data) })
})

// DELETE /skills/:id — exclui (fundador ou o dono da skill)
router.delete('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await getViewer(req, supa)
  if (!viewer.email) return res.status(401).json({ error: 'unauthorized' })
  if (!viewer.isFounder) {
    const { data: existing } = await supa.from('system_skills').select('owner_email').eq('id', req.params.id).single()
    if (!existing || (existing.owner_email || '').toLowerCase() !== viewer.email) {
      return res.status(403).json({ error: 'forbidden', message: 'Você só pode excluir as suas skills.' })
    }
  }
  const { error } = await supa.from('system_skills').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

// POST /skills/:id/copied — incrementa o contador de cópias (qualquer usuário)
router.post('/:id/copied', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { data } = await supa.from('system_skills').select('copies').eq('id', req.params.id).single()
  if (data) await supa.from('system_skills').update({ copies: (Number(data.copies) || 0) + 1 }).eq('id', req.params.id)
  res.json({ ok: true })
})

export default router
