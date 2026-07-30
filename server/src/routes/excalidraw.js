import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { resolveAccess, canSeeRow, userIdByEmail, emailByUserId } from './workspace.js'
import { accessTokenForUser } from './drive.js'

const TRASH_TTL_MS = 7 * 24 * 60 * 60 * 1000 // storyboards excluídos são purgados após 7 dias

// Purga (de verdade) os storyboards excluídos há mais de 7 dias: apaga a pasta do
// projeto no Drive do dono (best-effort) e remove a linha. Best-effort e não
// bloqueia a resposta — roda ao listar. Só o próprio dono dispara a purga do seu.
async function purgeExpiredTrash(supa, ownerId) {
  const cutoff = new Date(Date.now() - TRASH_TTL_MS).toISOString()
  const { data: expired = [] } = await supa
    .from('excalidraw_scenes')
    .select('id, storage, drive_folder_id, user_id')
    .eq('user_id', ownerId)
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
  if (!expired.length) return
  let tok = null
  for (const row of expired) {
    if (row.storage === 'drive' && row.drive_folder_id) {
      try {
        tok = tok || (await accessTokenForUser(supa, row.user_id))
        if (tok) await fetch(`https://www.googleapis.com/drive/v3/files/${row.drive_folder_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.accessToken}` } })
      } catch {
        /* segue e remove o índice mesmo assim */
      }
    }
    await supa.from('excalidraw_scenes').delete().eq('id', row.id)
  }
}

// Storyboards são uma biblioteca compartilhada: o acesso do colaborador segue o
// nível de "Desenhos" (drawings_access) do workspace do dono.
//   drawings 'view'|'edit' → pode VER (respeitando a visibilidade por item)
//   drawings 'edit'        → pode EDITAR/CRIAR (grava no Drive do DONO)
//   apagar                 → SOMENTE o dono

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
    createdBy: row.created_by || null,
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
  if (!access.self && access.drawings === 'none') return res.json({ scenes: [] })
  const ownerId = access.self ? user.id : await userIdByEmail(supa, access.owner)
  if (!ownerId) return res.status(404).json({ error: 'owner_not_found' })
  // Purga preguiçosa dos excluídos há +7 dias (só o próprio dono, best-effort).
  if (access.self) purgeExpiredTrash(supa, ownerId).catch(() => {})
  const { data = [], error } = await supa
    .from('excalidraw_scenes')
    .select('id, name, thumbnail, storage, drive_folder_id, drive_scene_file_id, size_bytes, video_id, visibility, allowed_emails, created_by, created_at, updated_at')
    .eq('user_id', ownerId)
    .is('deleted_at', null) // não lista os que estão na "lixeira" (backup de 7 dias)
    .order('updated_at', { ascending: false })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  // Colaborador só recebe os storyboards que o dono deixou visíveis pra ele.
  const visible = (data || []).filter((r) => canSeeRow(r, user.email, access.self))
  res.json({ scenes: visible.map(toClient) })
})

// Purga TODOS os storyboards expirados (>7 dias na lixeira). Usado pelo Vercel
// Cron (1x/dia) — timing garantido, independente de alguém abrir a galeria.
async function purgeAllExpired(supa) {
  const cutoff = new Date(Date.now() - TRASH_TTL_MS).toISOString()
  const { data: expired = [] } = await supa
    .from('excalidraw_scenes')
    .select('id, storage, drive_folder_id, user_id')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
  const tokens = new Map() // token do Drive por dono (reutiliza entre arquivos)
  for (const row of expired) {
    if (row.storage === 'drive' && row.drive_folder_id) {
      try {
        if (!tokens.has(row.user_id)) tokens.set(row.user_id, await accessTokenForUser(supa, row.user_id))
        const tok = tokens.get(row.user_id)
        if (tok) await fetch(`https://www.googleapis.com/drive/v3/files/${row.drive_folder_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.accessToken}` } })
      } catch {
        /* segue e remove o índice mesmo assim */
      }
    }
    await supa.from('excalidraw_scenes').delete().eq('id', row.id)
  }
  return expired.length
}

// GET /purge-trash — chamado pelo Vercel Cron. Protegido pelo CRON_SECRET (a
// Vercel envia "Authorization: Bearer <CRON_SECRET>" quando a env está setada).
router.get('/purge-trash', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const secret = process.env.CRON_SECRET
  if (secret && (req.headers.authorization || '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })
  const purged = await purgeAllExpired(supa).catch(() => 0)
  res.json({ ok: true, purged })
})

// GET /trash — storyboards na LIXEIRA do usuário (recuperáveis por 7 dias).
router.get('/trash', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const { data = [] } = await supa
    .from('excalidraw_scenes')
    .select('id, name, thumbnail, storage, drive_folder_id, drive_scene_file_id, size_bytes, video_id, visibility, allowed_emails, created_by, created_at, updated_at, deleted_at')
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
  const scenes = (data || []).map((r) => ({
    ...toClient(r),
    deletedAt: r.deleted_at,
    expiresAt: r.deleted_at ? new Date(new Date(r.deleted_at).getTime() + TRASH_TTL_MS).toISOString() : null,
  }))
  res.json({ scenes })
})

// Confere se o usuário é dono (user_id) OU autor (created_by) de uma cena.
async function ownsScene(supa, user, id) {
  const { data: scene } = await supa.from('excalidraw_scenes').select('user_id, created_by, storage, drive_folder_id').eq('id', id).maybeSingle()
  if (!scene) return { notFound: true }
  const ok = scene.user_id === user.id || (scene.created_by && String(scene.created_by).toLowerCase() === (user.email || '').toLowerCase())
  return ok ? { scene } : { forbidden: true }
}

// POST /:id/restore — tira o storyboard da lixeira (dono/autor).
router.post('/:id/restore', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const r = await ownsScene(supa, user, req.params.id)
  if (r.notFound) return res.status(404).json({ error: 'not_found' })
  if (r.forbidden) return res.status(403).json({ error: 'forbidden' })
  const { error } = await supa.from('excalidraw_scenes').update({ deleted_at: null }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

// DELETE /:id/purge — exclui AGORA de vez (dono/autor), inclusive a pasta no Drive.
router.delete('/:id/purge', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const r = await ownsScene(supa, user, req.params.id)
  if (r.notFound) return res.json({ ok: true, already: true })
  if (r.forbidden) return res.status(403).json({ error: 'forbidden' })
  if (r.scene.storage === 'drive' && r.scene.drive_folder_id) {
    try {
      const tok = await accessTokenForUser(supa, r.scene.user_id || user.id)
      if (tok) await fetch(`https://www.googleapis.com/drive/v3/files/${r.scene.drive_folder_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.accessToken}` } })
    } catch {
      /* segue */
    }
  }
  const { error } = await supa.from('excalidraw_scenes').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

// Autoriza o requester numa cena existente. Devolve { scene, access, isOwner } ou
// null se não pode ver. `needEdit` exige nível de edição do colaborador.
async function authorizeScene(supa, user, sceneId, needEdit = false) {
  const { data: scene } = await supa.from('excalidraw_scenes').select('*').eq('id', sceneId).is('deleted_at', null).maybeSingle()
  if (!scene) return { notFound: true }
  if (scene.user_id === user.id) return { scene, isOwner: true }
  // Cena de outro usuário: precisa ser colaborador do dono com acesso a Desenhos.
  const ownerEmail = await emailByUserId(supa, scene.user_id)
  const access = ownerEmail ? await resolveAccess(supa, user, ownerEmail) : null
  if (!access || access.drawings === 'none') return { forbidden: true }
  if (needEdit && access.drawings !== 'edit') return { forbidden: true }
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
  // do dono). Exige nível de edição em Desenhos.
  let ownerId = user.id
  if (owner) {
    const access = await resolveAccess(supa, user, owner)
    if (!access) return res.status(403).json({ error: 'forbidden' })
    if (!access.self) {
      if (access.drawings !== 'edit') return res.status(403).json({ error: 'forbidden' })
      ownerId = await userIdByEmail(supa, access.owner)
      if (!ownerId) return res.status(404).json({ error: 'owner_not_found' })
    }
  }
  // Projeto no Drive: o navegador já criou a pasta + scene.json; o banco guarda só
  // o índice (sem a cena). Projeto 'db': cena pequena fica no próprio banco.
  const isDrive = storage === 'drive'
  const row = {
    user_id: ownerId,
    created_by: (user.email || '').toLowerCase(), // quem REALMENTE criou (pode ser o editor, mesmo que a cena viva no Drive do dono)
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

// DELETE /:id — o DONO da cena (user_id) apaga qualquer uma; um colaborador só
// apaga a cena que ELE mesmo criou (created_by = e-mail dele). Cenas antigas sem
// created_by, ou criadas pelo dono, só o dono apaga.
router.delete('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const { data: scene } = await supa.from('excalidraw_scenes').select('user_id, created_by').eq('id', req.params.id).maybeSingle()
  if (!scene) return res.json({ ok: true, already: true })
  const isOwner = scene.user_id === user.id
  const isAuthor = scene.created_by && String(scene.created_by).toLowerCase() === (user.email || '').toLowerCase()
  if (!isOwner && !isAuthor) return res.status(403).json({ error: 'forbidden_not_author', message: 'Você só pode excluir storyboards que você mesmo criou.' })
  // SOFT-DELETE: vai para a "lixeira" (backup). Sai da lista e não abre mais, mas
  // fica recuperável por 7 dias; depois a purga (ao listar) apaga de vez, inclusive
  // a pasta no Drive. Não mexemos no arquivo do Drive agora.
  const { error } = await supa.from('excalidraw_scenes').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

export default router
