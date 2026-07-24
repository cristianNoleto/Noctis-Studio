import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { resolveAccess, canSeeRow, userIdByEmail, emailByUserId } from './workspace.js'

// Storyboards são tratados como uma biblioteca compartilhada: o acesso do
// colaborador segue o nível de "referências" do workspace do dono.
//   references 'view'|'edit' → pode VER (respeitando a visibilidade por item)
//   references 'edit'        → pode EDITAR/CRIAR (grava no Drive do DONO)
//   apagar                   → SOMENTE o dono

// Projetos do Excalidraw (quadro de desenho). Cada cena é guardada numa tabela
// dedicada (excalidraw_scenes), com salvamento próprio — FORA do write-through
// do workspace, para as cenas grandes não pesarem no sync geral.
const router = Router()

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

async function ensureProfile(supa, user) {
  await supa.from('profiles').upsert({ id: user.id, display_name: user.user_metadata?.name || user.email }, { onConflict: 'id' })
}

function toClient(row) {
  return {
    id: row.id,
    name: row.name,
    thumbnail: row.thumbnail || null,
    scene: row.scene || null,
    storage: row.storage || 'db',
    driveFolderId: row.drive_folder_id || null,
    driveSceneFileId: row.drive_scene_file_id || null,
    sizeBytes: Number(row.size_bytes || 0),
    videoId: row.video_id || null,
    visibility: row.visibility || 'workspace',
    allowedEmails: row.allowed_emails || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// GET / — lista os projetos (SEM a cena, só metadados). Com ?owner=<email> de
// outro usuário, devolve os storyboards do DONO que o colaborador tem direito de ver.
router.get('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const access = await resolveAccess(supa, user, req.query.owner)
  if (!access) return res.status(403).json({ error: 'forbidden' })
  if (!access.self && access.references === 'none') return res.json({ scenes: [] })
  const ownerId = access.self ? user.id : await userIdByEmail(supa, access.owner)
  if (!ownerId) return res.status(404).json({ error: 'owner_not_found' })
  const { data = [], error } = await supa
    .from('excalidraw_scenes')
    .select('id, name, thumbnail, storage, drive_folder_id, drive_scene_file_id, size_bytes, video_id, visibility, allowed_emails, created_at, updated_at')
    .eq('user_id', ownerId)
    .order('updated_at', { ascending: false })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  // Colaborador só recebe os storyboards que o dono deixou visíveis pra ele.
  const visible = (data || []).filter((r) => canSeeRow(r, user.email, access.self))
  res.json({ scenes: visible.map(toClient) })
})

// Autoriza o requester numa cena existente. Devolve { scene, access, isOwner } ou
// null se não pode ver. `needEdit` exige nível de edição do colaborador.
async function authorizeScene(supa, user, sceneId, needEdit = false) {
  const { data: scene } = await supa.from('excalidraw_scenes').select('*').eq('id', sceneId).maybeSingle()
  if (!scene) return { notFound: true }
  if (scene.user_id === user.id) return { scene, isOwner: true }
  // Cena de outro usuário: precisa ser colaborador do dono com acesso a referências.
  const ownerEmail = await emailByUserId(supa, scene.user_id)
  const access = ownerEmail ? await resolveAccess(supa, user, ownerEmail) : null
  if (!access || access.references === 'none') return { forbidden: true }
  if (needEdit && access.references !== 'edit') return { forbidden: true }
  if (!canSeeRow(scene, user.email, false)) return { forbidden: true }
  return { scene, isOwner: false }
}

// GET /:id — projeto completo (com a cena). Dono OU colaborador autorizado.
router.get('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const r = await authorizeScene(supa, user, req.params.id)
  if (r.notFound) return res.status(404).json({ error: 'not_found' })
  if (r.forbidden) return res.status(403).json({ error: 'forbidden' })
  res.json({ scene: toClient(r.scene) })
})

// POST / — cria um projeto novo (vazio ou com cena inicial)
router.post('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  await ensureProfile(supa, user)
  const { name, scene, storage, driveFolderId, driveSceneFileId, videoId, visibility, allowedEmails, owner } = req.body || {}
  // Editor criando no workspace de outro: a cena pertence ao DONO (fica no Drive
  // do dono). Exige nível de edição em referências.
  let ownerId = user.id
  if (owner) {
    const access = await resolveAccess(supa, user, owner)
    if (!access) return res.status(403).json({ error: 'forbidden' })
    if (!access.self) {
      if (access.references !== 'edit') return res.status(403).json({ error: 'forbidden' })
      ownerId = await userIdByEmail(supa, access.owner)
      if (!ownerId) return res.status(404).json({ error: 'owner_not_found' })
    }
  }
  // Projeto no Drive: o navegador já criou a pasta + scene.json; o banco guarda só
  // o índice (sem a cena). Projeto 'db': cena pequena fica no próprio banco.
  const isDrive = storage === 'drive'
  const row = {
    user_id: ownerId,
    name: (name || 'Sem título').slice(0, 120),
    storage: isDrive ? 'drive' : 'db',
    scene: isDrive ? null : scene || {},
    drive_folder_id: isDrive ? driveFolderId || null : null,
    drive_scene_file_id: isDrive ? driveSceneFileId || null : null,
    video_id: videoId || null,
    visibility: ['only_me', 'workspace', 'specific'].includes(visibility) ? visibility : 'workspace',
    allowed_emails: Array.isArray(allowedEmails) ? allowedEmails : [],
  }
  const { data, error } = await supa.from('excalidraw_scenes').insert(row).select('*').single()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ scene: toClient(data) })
})

// PUT /:id — salva alterações. Editor pode salvar conteúdo (cena/nome/miniatura);
// visibilidade, permissões e vínculo com vídeo são SOMENTE do dono.
router.put('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const r = await authorizeScene(supa, user, req.params.id, true) // precisa poder editar
  if (r.notFound) return res.status(404).json({ error: 'not_found' })
  if (r.forbidden) return res.status(403).json({ error: 'forbidden' })
  const patch = { updated_at: new Date().toISOString() }
  if (typeof req.body?.name === 'string') patch.name = req.body.name.slice(0, 120)
  if (req.body?.scene !== undefined) patch.scene = req.body.scene
  if (req.body?.thumbnail !== undefined) patch.thumbnail = req.body.thumbnail
  if (req.body?.sizeBytes !== undefined) patch.size_bytes = Number(req.body.sizeBytes) || 0
  // Só o dono muda visibilidade/permissões/vínculo com vídeo.
  if (r.isOwner) {
    if (req.body?.videoId !== undefined) patch.video_id = req.body.videoId || null
    if (['only_me', 'workspace', 'specific'].includes(req.body?.visibility)) patch.visibility = req.body.visibility
    if (req.body?.allowedEmails !== undefined) patch.allowed_emails = Array.isArray(req.body.allowedEmails) ? req.body.allowedEmails : []
  }
  const { data, error } = await supa.from('excalidraw_scenes').update(patch).eq('id', req.params.id).select('*').maybeSingle()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  if (!data) return res.status(404).json({ error: 'not_found' })
  res.json({ scene: toClient(data) })
})

// DELETE /:id
router.delete('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const { error } = await supa.from('excalidraw_scenes').delete().eq('id', req.params.id).eq('user_id', user.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

export default router
