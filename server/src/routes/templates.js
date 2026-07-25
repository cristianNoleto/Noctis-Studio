import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Biblioteca de MODELOS de Excalidraw (desenhos pré-preenchidos).
//   Leitura: qualquer usuário logado vê os modelos que tem direito (global +
//            do próprio + do workspace onde é colaborador de Desenhos).
//   Escrita: fundador (FOUNDER_EMAIL) OU planos Pro/Master.
//   Só o fundador publica no GLOBAL; os demais caem em workspace.
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

// Pode criar/editar modelos: fundador OU plano Pro/Master.
async function requireCreator(req, res, supa) {
  const viewer = await getViewer(req, supa)
  if (!viewer.email) {
    res.status(401).json({ error: 'unauthorized', message: 'Faça login para gerenciar modelos.' })
    return null
  }
  if (!viewer.isFounder && !['PRO', 'MASTER'].includes(viewer.plan)) {
    res.status(403).json({ error: 'forbidden', message: 'Apenas o fundador e o plano Pro podem criar modelos.' })
    return null
  }
  return viewer
}

// Donos de workspace em que o email é colaborador COM acesso a Desenhos — é o que
// libera a visibilidade "workspace" dos modelos (segue o acesso drawings_access).
async function templateWorkspaceOwners(supa, email) {
  if (!email) return new Set()
  const { data } = await supa.from('workspace_collaborators').select('owner_email, drawings_access').eq('member_email', email)
  return new Set((data || []).filter((c) => c.drawings_access && c.drawings_access !== 'none').map((c) => (c.owner_email || '').toLowerCase()))
}

function canSeeRow(r, viewer, owners) {
  if (viewer.isFounder) return true
  const vis = r.visibility || 'workspace'
  const owner = (r.owner_email || '').toLowerCase()
  if (owner && owner === viewer.email) return true
  if (vis === 'global') return true
  if (vis === 'only_me') return false
  if (vis === 'specific') return (r.allowed_emails || []).map((e) => String(e).toLowerCase()).includes(viewer.email)
  if (vis === 'workspace') return owners.has(owner)
  return false
}

// Metadados (sem a cena) — a listagem é leve; a cena vem só ao usar/editar.
function toClientMeta(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    category: r.category || '',
    thumbnail: r.thumbnail || null,
    ownerEmail: r.owner_email || '',
    createdBy: r.created_by || '',
    visibility: r.visibility || 'workspace',
    allowedEmails: Array.isArray(r.allowed_emails) ? r.allowed_emails : [],
    uses: Number(r.uses) || 0,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
  }
}

// GET /excalidraw-templates — lista (só metadados) os modelos visíveis ao usuário
router.get('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await getViewer(req, supa)
  const { data, error } = await supa
    .from('excalidraw_templates')
    .select('id, name, description, category, thumbnail, owner_email, created_by, visibility, allowed_emails, uses, created_at')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  let rows = data || []
  if (!viewer.isFounder) {
    const owners = await templateWorkspaceOwners(supa, viewer.email)
    rows = rows.filter((r) => canSeeRow(r, viewer, owners))
  }
  res.json({ templates: rows.map(toClientMeta) })
})

// GET /excalidraw-templates/:id — modelo completo (com a cena), se puder ver
router.get('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await getViewer(req, supa)
  const { data: r } = await supa.from('excalidraw_templates').select('*').eq('id', req.params.id).maybeSingle()
  if (!r) return res.status(404).json({ error: 'not_found' })
  if (!viewer.isFounder) {
    const owners = await templateWorkspaceOwners(supa, viewer.email)
    if (!canSeeRow(r, viewer, owners)) return res.status(403).json({ error: 'forbidden' })
  }
  res.json({ template: { ...toClientMeta(r), scene: r.scene || {} } })
})

// POST /excalidraw-templates — cria/atualiza (fundador ou Pro; dono só o seu)
router.post('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await requireCreator(req, res, supa)
  if (!viewer) return
  const t = req.body?.template || {}
  if (!t.name?.trim()) return res.status(400).json({ error: 'invalid', message: 'O nome do modelo é obrigatório.' })
  // Não-fundador não edita modelo de outro dono.
  if (t.id && !viewer.isFounder) {
    const { data: existing } = await supa.from('excalidraw_templates').select('owner_email').eq('id', t.id).single()
    if (!existing || (existing.owner_email || '').toLowerCase() !== viewer.email) {
      return res.status(403).json({ error: 'forbidden', message: 'Você só pode editar os seus modelos.' })
    }
  }
  let visibility = ['global', 'workspace', 'specific', 'only_me'].includes(t.visibility) ? t.visibility : 'workspace'
  if (!viewer.isFounder && visibility === 'global') visibility = 'workspace' // só fundador publica no global
  const allowed =
    visibility === 'specific' && Array.isArray(t.allowedEmails)
      ? [...new Set(t.allowedEmails.map((e) => String(e).toLowerCase().trim()).filter((e) => e.includes('@')))].slice(0, 50)
      : []
  const row = {
    name: t.name.trim().slice(0, 120),
    description: String(t.description || '').slice(0, 500),
    category: String(t.category || '').slice(0, 60),
    thumbnail: typeof t.thumbnail === 'string' ? t.thumbnail : null,
    visibility,
    allowed_emails: allowed,
    updated_at: new Date().toISOString(),
  }
  // A cena só é gravada quando enviada (na criação sempre; na edição de metadados pode faltar).
  if (t.scene !== undefined) row.scene = t.scene || {}
  if (!t.id) {
    row.owner_email = viewer.email
    row.created_by = viewer.email
    if (row.scene === undefined) row.scene = {}
  }
  const query = t.id
    ? supa.from('excalidraw_templates').update(row).eq('id', t.id).select('*').single()
    : supa.from('excalidraw_templates').insert(row).select('*').single()
  const { data, error } = await query
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ template: { ...toClientMeta(data), scene: data.scene || {} } })
})

// POST /excalidraw-templates/:id/used — incrementa o contador de usos
router.post('/:id/used', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { data } = await supa.from('excalidraw_templates').select('uses').eq('id', req.params.id).single()
  if (data) await supa.from('excalidraw_templates').update({ uses: (Number(data.uses) || 0) + 1 }).eq('id', req.params.id)
  res.json({ ok: true })
})

// DELETE /excalidraw-templates/:id — exclui (fundador ou o dono do modelo)
router.delete('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await getViewer(req, supa)
  if (!viewer.email) return res.status(401).json({ error: 'unauthorized' })
  if (!viewer.isFounder) {
    const { data: existing } = await supa.from('excalidraw_templates').select('owner_email').eq('id', req.params.id).single()
    if (!existing || (existing.owner_email || '').toLowerCase() !== viewer.email) {
      return res.status(403).json({ error: 'forbidden', message: 'Você só pode excluir os seus modelos.' })
    }
  }
  const { error } = await supa.from('excalidraw_templates').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

export default router
