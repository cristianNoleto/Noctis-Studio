import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { accessTokenForUser } from './drive.js'

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
  if (!token) return { id: null, email: '', plan: 'FREE', isFounder: false }
  const { data } = await supa.auth.getUser(token)
  const email = (data?.user?.email || '').toLowerCase()
  const plan = data?.user?.app_metadata?.plan || 'FREE'
  return { id: data?.user?.id || null, email, plan, isFounder: !!email && founderEmails().includes(email) }
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
    storage: r.storage || 'db',
    sizeBytes: Number(r.size_bytes || 0),
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

// Carrega a cena de um modelo: do banco ('db') ou do Drive do CRIADOR ('drive').
// No caso Drive, o servidor baixa com o token do criador (accessTokenForUser) —
// assim modelos GLOBAIS no Drive de alguém continuam acessíveis a todos, sem
// expor o token. Se o criador apagou o arquivo, devolve { error:'file_missing' }.
async function loadScene(supa, r) {
  if (r.storage === 'drive' && r.drive_file_id) {
    const tok = r.owner_id ? await accessTokenForUser(supa, r.owner_id) : null
    if (!tok) return { error: 'drive_unavailable' }
    let dr
    try {
      dr = await fetch(`https://www.googleapis.com/drive/v3/files/${r.drive_file_id}?alt=media`, { headers: { Authorization: `Bearer ${tok.accessToken}` } })
    } catch {
      return { error: 'drive_error' }
    }
    if (dr.status === 404) return { error: 'file_missing' }
    if (!dr.ok) return { error: 'drive_error' }
    try {
      return { scene: JSON.parse(await dr.text()) }
    } catch {
      return { error: 'drive_error' }
    }
  }
  return { scene: r.scene || {} }
}

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
  const loaded = await loadScene(supa, r)
  if (loaded.error === 'file_missing') return res.status(410).json({ error: 'file_missing', creatorEmail: r.created_by || r.owner_email || '' })
  if (loaded.error) return res.status(502).json({ error: loaded.error, message: 'Não foi possível carregar o modelo do Drive.' })
  res.json({ template: { ...toClientMeta(r), scene: loaded.scene } })
})

// POST /excalidraw-templates — cria/atualiza (fundador ou Pro; dono só o seu)
router.post('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const viewer = await requireCreator(req, res, supa)
  if (!viewer) return
  const t = req.body?.template || {}
  if (!t.name?.trim()) return res.status(400).json({ error: 'invalid', message: 'O nome do modelo é obrigatório.' })
  // Editar modelo existente: fundador, o DONO do modelo (owner_email) ou quem o
  // CRIOU (created_by).
  if (t.id && !viewer.isFounder) {
    const { data: existing } = await supa.from('excalidraw_templates').select('owner_email, created_by').eq('id', t.id).single()
    const own = existing && ((existing.owner_email || '').toLowerCase() === viewer.email || (existing.created_by || '').toLowerCase() === viewer.email)
    if (!own) return res.status(403).json({ error: 'forbidden', message: 'Você só pode editar os seus modelos.' })
  }
  let visibility = ['global', 'workspace', 'specific', 'only_me'].includes(t.visibility) ? t.visibility : 'workspace'
  // Publicar no GLOBAL: liberado para fundador E planos Pro (requireCreator já
  // garante que é fundador ou Pro/Master).

  // Destino em workspace de OUTRO dono (colaborador publicando no workspace do
  // dono): exige acesso de EDIÇÃO a Desenhos naquele workspace. Força visibility
  // 'workspace' (o modelo passa a pertencer àquele workspace).
  let targetOwner = String(t.targetOwner || '').toLowerCase().trim()
  if (targetOwner && targetOwner !== viewer.email) {
    if (!viewer.isFounder) {
      const { data: collab } = await supa.from('workspace_collaborators').select('drawings_access').eq('owner_email', targetOwner).eq('member_email', viewer.email).maybeSingle()
      if (!collab || collab.drawings_access !== 'edit') {
        return res.status(403).json({ error: 'forbidden', message: 'Sem acesso de edição a Desenhos nesse workspace.' })
      }
    }
    visibility = 'workspace'
  } else {
    targetOwner = ''
  }
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
  // Armazenamento: 'db' (cena no jsonb) ou 'drive' (modelo grande no Drive do criador).
  const isDrive = t.storage === 'drive' && t.driveFileId
  if (isDrive) {
    row.storage = 'drive'
    row.drive_file_id = t.driveFileId
    row.drive_folder_id = t.driveFolderId || null
    row.size_bytes = Number(t.sizeBytes) || 0
    row.scene = null // a cena vive no Drive
  } else if (t.scene !== undefined) {
    row.storage = 'db'
    row.scene = t.scene || {}
  }
  if (!t.id) {
    row.owner_email = targetOwner || viewer.email // destino: workspace do dono ou o próprio
    row.created_by = viewer.email
    row.owner_id = viewer.id // dono do Drive (emite o token no download dos modelos 'drive')
    if (row.scene === undefined && !isDrive) row.scene = {}
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
  const { data: existing } = await supa.from('excalidraw_templates').select('owner_email, created_by, storage, drive_file_id, owner_id').eq('id', req.params.id).maybeSingle()
  if (!existing) return res.json({ ok: true, already: true })
  if (!viewer.isFounder) {
    const own = (existing.owner_email || '').toLowerCase() === viewer.email || (existing.created_by || '').toLowerCase() === viewer.email
    if (!own) return res.status(403).json({ error: 'forbidden', message: 'Você só pode excluir os seus modelos.' })
  }
  // Modelo no Drive: apaga também o arquivo no Drive do criador (best-effort).
  if (existing.storage === 'drive' && existing.drive_file_id && existing.owner_id) {
    try {
      const tok = await accessTokenForUser(supa, existing.owner_id)
      if (tok) await fetch(`https://www.googleapis.com/drive/v3/files/${existing.drive_file_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.accessToken}` } })
    } catch {
      /* segue e remove o índice mesmo assim */
    }
  }
  const { error } = await supa.from('excalidraw_templates').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

export default router
