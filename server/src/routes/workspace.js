import { Router } from 'express'
import { createHash } from 'crypto'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// ---------------------------------------------------------------------------
// Migração localStorage -> Postgres (tabelas normalizadas).
//   POST /workspace/migrate  { data }  → sobe o estado do client para o banco
//   GET  /workspace/snapshot           → lê de volta no formato flat do client
// O dono (owner) é derivado do token do usuário logado (nunca chumbado).
// Campos sem coluna dedicada vão para `extra jsonb` (round-trip sem perda).
// ---------------------------------------------------------------------------
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

// Garante que exista a linha em profiles (FK das tabelas por usuário).
async function ensureProfile(supa, user) {
  await supa.from('profiles').upsert({ id: user.id, display_name: user.user_metadata?.name || user.email }, { onConflict: 'id' })
}

// Configuração de mapeamento por coleção (ordem = respeita dependências de FK).
// owner: coluna que recebe o id do dono (owner_id|user_id) para tabelas de topo.
// parent: { field, col } liga ao pai por um campo do próprio registro do client.
// cols: { campoClient: coluna_db }. required: defaults p/ colunas NOT NULL.
const CONFIG = [
  { key: 'channels', table: 'channels', owner: 'owner_id',
    cols: { name: 'name', avatarUrl: 'avatar_url', youtubeChannelId: 'youtube_channel_id', language: 'language', contactEmail: 'contact_email', notes: 'notes', ytSubscribers: 'yt_subscribers', ytTotalViews: 'yt_total_views', ytStatsUpdatedAt: 'yt_stats_updated_at', postTimes: 'post_times', archived: 'archived', postedBaseline: 'posted_baseline', frequency: 'frequency_label', weeklyFrequency: 'weekly_post_frequency', createdAt: 'created_at' },
    // Colunas NOT NULL precisam SEMPRE ter valor: no upsert em lote, o supabase-js
    // usa a UNIÃO das chaves; um canal novo sem `archived`/`post_times`/etc. iria
    // com null (não pega o default do banco) e derrubaria o lote inteiro.
    required: { name: 'Canal', language: 'pt', archived: false, postedBaseline: 0, postTimes: [] } },
  { key: 'channelButtons', table: 'channel_custom_buttons', parent: { field: 'channelId', col: 'channel_id' },
    cols: { label: 'label', url: 'url', position: 'position' }, required: { label: '', url: '', position: 0 } },
  { key: 'videos', table: 'channel_videos', parent: { field: 'channelId', col: 'channel_id' }, author: true,
    cols: { title: 'title', description: 'description', tags: 'tags', thumbnailUrl: 'thumbnail_url', youtubeUrl: 'youtube_url', steps: 'steps', videoNumber: 'video_number', publishedAt: 'published_at', imported: 'imported', thumbnailConcept: 'thumbnail_concept', createdAt: 'created_at' },
    required: { title: 'Sem título' } },
  { key: 'scripts', table: 'video_scripts', parent: { field: 'videoId', col: 'video_id' },
    cols: { content: 'content' }, hasExtra: false },
  { key: 'seoReports', table: 'video_seo_reports', parent: { field: 'videoId', col: 'video_id' },
    cols: { score: 'score', report: 'report_json', createdAt: 'created_at' } },
  { key: 'boardSpaces', table: 'board_spaces', owner: 'user_id', author: true,
    cols: { name: 'name', position: 'position' }, required: { name: 'Espaço' } },
  { key: 'boardColumns', table: 'board_columns', owner: 'user_id', author: true,
    cols: { title: 'title', color: 'color', position: 'position', spaceId: 'space_id', channelId: 'channel_id' }, required: { title: 'Coluna' } },
  { key: 'boardCards', table: 'board_cards', parent: { field: 'columnId', col: 'column_id' }, author: true,
    cols: { title: 'title', color: 'color', position: 'position', source: 'source', sourceRef: 'source_ref', visibility: 'visibility', allowedEmails: 'allowed_emails', createdAt: 'created_at' }, required: { title: '' } },
  { key: 'checklistItems', table: 'board_card_checklist_items', parent: { field: 'cardId', col: 'card_id' },
    cols: { label: 'label', done: 'done', position: 'position' }, required: { label: '', position: 0 } },
  { key: 'referenceFolders', table: 'reference_folders', owner: 'user_id', author: true,
    cols: { name: 'name', channelId: 'channel_id', createdAt: 'created_at' }, required: { name: 'Pasta' } },
  { key: 'referenceChannels', table: 'reference_channels', parent: { field: 'folderId', col: 'folder_id' }, author: true,
    cols: { youtubeUrl: 'youtube_url', youtubeChannelId: 'youtube_channel_id', niche: 'niche', notes: 'notes', cachedStats: 'cached_stats', visibility: 'visibility', allowedEmails: 'allowed_emails', createdAt: 'created_at' }, required: { youtubeUrl: '' } },
  { key: 'promptCategories', table: 'prompt_categories', owner: 'user_id', author: true,
    cols: { name: 'name', position: 'position' }, required: { name: 'Categoria' } },
  { key: 'prompts', table: 'prompts', owner: 'user_id', author: true,
    cols: { name: 'name', content: 'content', notes: 'notes', channelId: 'channel_id', categoryId: 'category_id', suggestedLanguage: 'suggested_language', isFavorite: 'is_favorite', createdAt: 'created_at' }, required: { name: 'Prompt', content: '' } },
  { key: 'transcriptions', table: 'transcriptions', owner: 'user_id',
    cols: { sourceType: 'source_type', sourceUrl: 'source_url', status: 'status', result: 'result_json', createdAt: 'created_at' }, required: { sourceType: 'upload' } },
  { key: 'nicheAnalyses', table: 'niche_doubling_analyses', owner: 'user_id',
    cols: { result: 'result_json', createdAt: 'created_at' }, required: {}, special: 'niche' },
]

const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// Ids do client que NÃO são UUID (ex.: vídeos importados do YouTube, cujo id é
// o id do YouTube) viram um UUID DETERMINÍSTICO (mesmo id de origem → sempre o
// mesmo UUID). A MESMA conversão é aplicada às referências (videoId, folderId…),
// então as chaves estrangeiras continuam batendo.
function toUuid(v) {
  if (v == null) return null
  if (isUuid(v)) return v
  const h = createHash('sha1').update(String(v)).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

// Campos do client que apontam para o id de outro registro (precisam da mesma
// conversão de id para as FKs continuarem consistentes).
const FK_FIELDS = new Set(['channelId', 'videoId', 'columnId', 'cardId', 'folderId', 'categoryId', 'spaceId'])

// Converte ms/number/ISO em ISO string (colunas timestamptz).
function toIso(v) {
  if (v == null) return null
  if (typeof v === 'number') return new Date(v).toISOString()
  return v
}
const TS_COLS = new Set(['created_at', 'published_at', 'yt_stats_updated_at'])

// registro do client -> linha do banco
function toRow(rec, cfg, ownerId) {
  const row = { extra: {} }
  if (rec.id != null) row.id = toUuid(rec.id)
  if (cfg.owner) row[cfg.owner] = ownerId
  if (cfg.parent) {
    const pid = rec[cfg.parent.field]
    if (pid != null) row[cfg.parent.col] = toUuid(pid)
  }
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'id') continue
    if (k === 'createdBy') continue // autoria é definida no SERVIDOR (anti-spoof), nunca pelo client
    if (cfg.parent && k === cfg.parent.field) continue
    const col = cfg.cols[k]
    if (col) row[col] = FK_FIELDS.has(k) ? toUuid(v) : TS_COLS.has(col) ? toIso(v) : v
    else if (cfg.hasExtra !== false) row.extra[k] = v
  }
  // defaults p/ colunas NOT NULL ausentes
  for (const [field, def] of Object.entries(cfg.required || {})) {
    const col = cfg.cols[field]
    if (col && (row[col] == null || row[col] === '')) row[col] = def
  }
  if (cfg.special === 'niche') {
    row.source_channel_youtube_id = rec.channel?.id || rec.sourceChannelYoutubeId || 'unknown'
    row.source_channel_name = rec.channel?.title || rec.sourceChannelName || null
    row.source_channel_avatar_url = rec.channel?.avatar || null
  }
  if (cfg.hasExtra === false) delete row.extra
  return row
}

// linha do banco -> registro do client
function toRec(row, cfg) {
  const rec = { id: row.id }
  const inv = Object.fromEntries(Object.entries(cfg.cols).map(([c, d]) => [d, c]))
  if (cfg.parent) rec[cfg.parent.field] = row[cfg.parent.col]
  for (const [col, val] of Object.entries(row)) {
    if (col === 'id' || col === 'extra') continue
    if (inv[col] !== undefined && val != null) {
      rec[inv[col]] = TS_COLS.has(col) && typeof val === 'string' ? new Date(val).getTime() : val
    }
  }
  if (row.extra && typeof row.extra === 'object') Object.assign(rec, row.extra)
  if (row.created_by !== undefined) rec.createdBy = row.created_by // autoria por item
  return rec
}

// POST /workspace/migrate — sobe o estado local do client
router.post('/migrate', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const access = await resolveAccess(supa, user, req.query.owner)
  if (!access) return res.status(403).json({ error: 'forbidden', message: 'Sem acesso a este workspace.' })
  const ownerId = access.self ? user.id : await userIdByEmail(supa, access.owner)
  if (!ownerId) return res.status(404).json({ error: 'owner_not_found' })
  if (access.self) await ensureProfile(supa, user)

  // Coleções que o requester pode ESCREVER neste workspace.
  // Colaborador: só vídeos (e filhos) e/ou referências, conforme a permissão.
  let writable = null
  if (!access.self) {
    writable = new Set()
    if (access.videos === 'edit') ['videos', 'scripts', 'seoReports'].forEach((k) => writable.add(k))
    if (access.references === 'edit') ['referenceFolders', 'referenceChannels'].forEach((k) => writable.add(k))
    if (access.board === 'edit') ['boardSpaces', 'boardColumns', 'boardCards', 'checklistItems'].forEach((k) => writable.add(k))
    if (access.skills === 'edit') ['promptCategories', 'prompts'].forEach((k) => writable.add(k))
    if (!writable.size) return res.status(403).json({ error: 'forbidden', message: 'Sem permissão de edição.' })
  }

  const data = { ...(req.body?.data || {}) }

  // Referências sem pasta (folderId ausente) ganham uma pasta padrão do dono,
  // senão violariam a FK/são perdidas na leitura.
  const refs = Array.isArray(data.referenceChannels) ? data.referenceChannels : []
  if (refs.some((r) => !r.folderId)) {
    const defId = `noctis-default-folder-${ownerId}`
    data.referenceFolders = [...(data.referenceFolders || []), { id: defId, name: 'Referências', createdAt: Date.now() }]
    data.referenceChannels = refs.map((r) => (r.folderId ? r : { ...r, folderId: defId }))
    if (writable) writable.add('referenceFolders')
  }

  // Qual tabela é o pai de cada coluna-FK (p/ descartar órfãos e não derrubar o lote).
  const PARENT_TABLE = {
    channel_id: 'channels', video_id: 'channel_videos', column_id: 'board_columns',
    card_id: 'board_cards', folder_id: 'reference_folders',
  }
  const inserted = {} // tabela -> Set de ids inseridos/válidos

  // Colaborador não insere canais/vídeos-pais — pré-carrega os ids do dono
  // para que os filhos (vídeos/roteiros/refs) passem no filtro de órfão e não
  // possam apontar para canais de outro dono.
  if (!access.self) {
    const ownChannels = (await supa.from('channels').select('id').eq('owner_id', ownerId)).data || []
    // Só entram como "pais válidos" (logo, graváveis) os canais que o colaborador
    // pode EDITAR. Com escopo por canal, canais 'view' ficam de fora → seus vídeos
    // caem no filtro de órfão e não podem ser alterados. Sem escopo, vale o nível
    // de vídeos do workspace (edit = todos os canais).
    const editableChannels = access.channelAccess
      ? ownChannels.filter((c) => access.channelAccess[c.id] === 'edit')
      : (access.videos === 'edit' ? ownChannels : [])
    const chIds = editableChannels.map((c) => c.id)
    inserted['channels'] = new Set(chIds)
    const ownVideos = chIds.length ? (await supa.from('channel_videos').select('id').in('channel_id', chIds)).data || [] : []
    inserted['channel_videos'] = new Set(ownVideos.map((v) => v.id))
    const ownFolders = (await supa.from('reference_folders').select('id').eq('user_id', ownerId)).data || []
    inserted['reference_folders'] = new Set(ownFolders.map((f) => f.id))
  }

  const summary = {}
  for (const cfg of CONFIG) {
    if (writable && !writable.has(cfg.key)) continue // colaborador só grava o permitido
    const list = Array.isArray(data[cfg.key]) ? data[cfg.key] : []
    let rows = list.map((rec) => toRow(rec, cfg, ownerId)).filter((r) => r.id)
    // Dedup por id: ids diferentes do client podem colidir no mesmo UUID (ex.: a
    // pasta padrão criada aqui vira o mesmo UUID de uma pasta já existente no lote).
    // Sem isso o upsert quebra com "ON CONFLICT cannot affect row a second time".
    if (rows.length) {
      const byId = new Map()
      for (const r of rows) byId.set(r.id, r)
      rows = [...byId.values()]
    }
    // Descarta filhos cujo pai não está sendo inserido (evita erro de FK no lote).
    if (cfg.parent) {
      const parentSet = inserted[PARENT_TABLE[cfg.parent.col]]
      const before = rows.length
      rows = rows.filter((r) => r[cfg.parent.col] && (!parentSet || parentSet.has(r[cfg.parent.col])))
      summary[`${cfg.key}_orfaos`] = before - rows.length || undefined
    }
    const prev = inserted[cfg.table] || new Set()
    if (!rows.length) { summary[cfg.key] = 0; inserted[cfg.table] = prev; continue }
    // Autoria por item (created_by): definida no SERVIDOR. Linha nova → quem está
    // gravando; linha já existente → PRESERVA o autor original (impede que um
    // colaborador se aposse de itens do dono ao editá-los). NULL = do dono.
    if (cfg.author) {
      const meEmail = (user.email || '').toLowerCase()
      const { data: existing = [] } = await supa.from(cfg.table).select('id, created_by').in('id', rows.map((r) => r.id))
      const prevBy = new Map((existing || []).map((e) => [e.id, e.created_by]))
      for (const r of rows) r.created_by = prevBy.has(r.id) ? (prevBy.get(r.id) ?? null) : meEmail
    }
    const { error } = await supa.from(cfg.table).upsert(rows, { onConflict: 'id' })
    if (!error) for (const r of rows) prev.add(r.id)
    inserted[cfg.table] = prev
    summary[cfg.key] = error ? `erro: ${error.message}` : rows.length
  }
  // limpa chaves _orfaos vazias
  for (const k of Object.keys(summary)) if (summary[k] === undefined) delete summary[k]
  res.json({ ok: true, owner: access.owner, self: access.self, summary })
})

// Coleções que podem ser apagadas via endpoint explícito. area = permissão
// necessária no workspace; ownerOnly = só o dono (ex.: canais). As FKs filhas
// têm ON DELETE CASCADE, então apagar a linha-pai limpa os filhos sozinho.
const DELETABLE = {
  channels: { table: 'channels', ownerOnly: true },
  videos: { table: 'channel_videos', area: 'videos' },
  referenceFolders: { table: 'reference_folders', area: 'references' },
  referenceChannels: { table: 'reference_channels', area: 'references' },
  boardSpaces: { table: 'board_spaces', area: 'board' },
  boardColumns: { table: 'board_columns', area: 'board' },
  boardCards: { table: 'board_cards', area: 'board' },
  prompts: { table: 'prompts', area: 'skills' },
  promptCategories: { table: 'prompt_categories', area: 'skills' },
}

// POST /workspace/delete { collection, id } [?owner=] — exclusão explícita e
// PERSISTENTE (o migrate é upsert-only, nunca apaga). Regra de autoria: o dono
// apaga qualquer item; o colaborador editor só apaga o que ELE criou
// (created_by = e-mail dele). NULL/diferente = criado pelo dono → 403.
router.post('/delete', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const access = await resolveAccess(supa, user, req.query.owner)
  if (!access) return res.status(403).json({ error: 'forbidden' })
  const { collection, id } = req.body || {}
  const cfg = DELETABLE[collection]
  if (!cfg || id == null) return res.status(400).json({ error: 'bad_request' })
  // Permissão de área. Canais = só o dono.
  const canEditArea = cfg.ownerOnly ? access.self : access.self || access[cfg.area] === 'edit'
  if (!canEditArea) return res.status(403).json({ error: 'forbidden' })
  const rid = toUuid(id)
  // Só consultamos created_by quando ele importa (colaborador em tabela com
  // autoria). Tabelas ownerOnly como `channels` NÃO têm a coluna created_by —
  // selecioná-la fazia o SELECT falhar e o delete virava no-op (canal não sumia).
  const needAuthor = !access.self && !cfg.ownerOnly
  const { data: row } = await supa.from(cfg.table).select(needAuthor ? 'id, created_by' : 'id').eq('id', rid).maybeSingle()
  if (!row) return res.json({ ok: true, already: true }) // já não existe
  // Colaborador só apaga o que ele mesmo criou.
  if (needAuthor) {
    const me = (user.email || '').toLowerCase()
    if (!row.created_by || String(row.created_by).toLowerCase() !== me) {
      return res.status(403).json({ error: 'forbidden_not_author', message: 'Você só pode excluir itens que você mesmo criou.' })
    }
  }
  // Lixeira: antes de apagar um CANAL, guarda um backup completo (30 dias). O
  // delete abaixo cascateia os filhos, então o snapshot precisa vir ANTES.
  if (collection === 'channels' && access.self) {
    try {
      await backupChannel(supa, ownerId, rid)
    } catch (e) {
      return res.status(500).json({ error: 'backup_failed', message: e.message })
    }
  }
  const { error } = await supa.from(cfg.table).delete().eq('id', rid)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

// Junta o canal + filhos num payload e grava na lixeira (deleted_channels).
async function backupChannel(supa, ownerId, channelId) {
  const [{ data: channel }, { data: buttons = [] }, { data: videos = [] }, { data: validation }] = await Promise.all([
    supa.from('channels').select('*').eq('id', channelId).maybeSingle(),
    supa.from('channel_custom_buttons').select('*').eq('channel_id', channelId),
    supa.from('channel_videos').select('*').eq('channel_id', channelId),
    supa.from('channel_validations').select('*').eq('channel_id', channelId).maybeSingle(),
  ])
  if (!channel) return
  const videoIds = (videos || []).map((v) => v.id)
  const [{ data: scripts = [] }, { data: seoReports = [] }] = videoIds.length
    ? await Promise.all([
        supa.from('video_scripts').select('*').in('video_id', videoIds),
        supa.from('video_seo_reports').select('*').in('video_id', videoIds),
      ])
    : [{ data: [] }, { data: [] }]
  const payload = { channel, buttons: buttons || [], videos: videos || [], scripts: scripts || [], seoReports: seoReports || [], validation: validation || null }
  await supa.from('deleted_channels').insert({ channel_id: channelId, owner_id: ownerId, name: channel.name || null, payload })
}

// Remove backups expirados (> 30 dias) do dono. Chamado ao listar a lixeira.
async function purgeExpired(supa, ownerId) {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
  await supa.from('deleted_channels').delete().eq('owner_id', ownerId).lt('deleted_at', cutoff)
}

// GET /workspace/trash — canais na lixeira do dono (com dias restantes).
router.get('/trash', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  await purgeExpired(supa, user.id)
  const { data = [] } = await supa.from('deleted_channels').select('id, channel_id, name, deleted_at, payload').eq('owner_id', user.id).order('deleted_at', { ascending: false })
  const items = (data || []).map((r) => ({
    id: r.id,
    channelId: r.channel_id,
    name: r.name,
    deletedAt: r.deleted_at,
    videoCount: Array.isArray(r.payload?.videos) ? r.payload.videos.length : 0,
  }))
  res.json({ items })
})

// POST /workspace/trash/:id/restore — recria o canal e os filhos do backup.
router.post('/trash/:id/restore', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const { data: bkp } = await supa.from('deleted_channels').select('*').eq('id', req.params.id).eq('owner_id', user.id).maybeSingle()
  if (!bkp) return res.status(404).json({ error: 'not_found' })
  const p = bkp.payload || {}
  // Ordem respeita as FKs: canal → botões/vídeos → roteiros/SEO → validação.
  if (p.channel) {
    const { error } = await supa.from('channels').upsert(p.channel, { onConflict: 'id' })
    if (error) return res.status(500).json({ error: 'restore_failed', message: error.message })
  }
  if (p.buttons?.length) await supa.from('channel_custom_buttons').upsert(p.buttons, { onConflict: 'id' })
  if (p.videos?.length) await supa.from('channel_videos').upsert(p.videos, { onConflict: 'id' })
  if (p.scripts?.length) await supa.from('video_scripts').upsert(p.scripts, { onConflict: 'id' })
  if (p.seoReports?.length) await supa.from('video_seo_reports').upsert(p.seoReports, { onConflict: 'id' })
  if (p.validation) await supa.from('channel_validations').upsert(p.validation, { onConflict: 'id' })
  await supa.from('deleted_channels').delete().eq('id', req.params.id)
  res.json({ ok: true })
})

// DELETE /workspace/trash/:id — apaga o backup em definitivo (antes dos 30 dias).
router.delete('/trash/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  await supa.from('deleted_channels').delete().eq('id', req.params.id).eq('owner_id', user.id)
  res.json({ ok: true })
})

// Resolve o id (auth) de um e-mail. Base pequena → listUsers.
export async function userIdByEmail(supa, email) {
  const e = (email || '').toLowerCase()
  const { data } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return (data?.users || []).find((x) => (x.email || '').toLowerCase() === e)?.id || null
}

export async function emailByUserId(supa, userId) {
  const { data } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return (data?.users || []).find((x) => x.id === userId)?.email || null
}

// Visibilidade por item (referências/cards do quadro): o dono vê tudo; o
// colaborador só vê itens 'workspace' (padrão) ou 'specific' com o e-mail dele
// na lista. 'only_me' fica escondido de qualquer colaborador. Coluna ausente/
// nula = 'workspace' (comportamento antigo: visível).
export function canSeeRow(row, requesterEmail, isSelf) {
  if (isSelf) return true
  const vis = row.visibility || 'workspace'
  if (vis === 'only_me') return false
  if (vis === 'specific') {
    const allowed = Array.isArray(row.allowed_emails) ? row.allowed_emails : []
    return allowed.map((e) => String(e).toLowerCase()).includes((requesterEmail || '').toLowerCase())
  }
  return true // 'workspace' (ou desconhecido) → visível
}

// Acesso do requester ao workspace de ownerEmail (self = próprio).
export async function resolveAccess(supa, requester, ownerEmail) {
  const me = (requester.email || '').toLowerCase()
  const owner = (ownerEmail || me).toLowerCase()
  if (owner === me) return { owner, self: true, videos: 'edit', skills: 'edit', references: 'edit', board: 'edit', drawings: 'edit', channelAccess: null }
  const { data } = await supa.from('workspace_collaborators').select('*').eq('owner_email', owner).eq('member_email', me).maybeSingle()
  if (!data) return null
  // channelAccess = null → sem escopo (usa videos p/ todos os canais); mapa
  // {id:'view'|'edit'} → o colaborador só vê esses canais, com o nível de cada.
  let channelAccess = data.channel_access && typeof data.channel_access === 'object' && !Array.isArray(data.channel_access) ? data.channel_access : null
  if (!channelAccess && Array.isArray(data.channel_ids) && data.channel_ids.length) {
    channelAccess = Object.fromEntries(data.channel_ids.map((id) => [id, data.videos_access === 'edit' ? 'edit' : 'view']))
  }
  return { owner, self: false, videos: data.videos_access || 'none', skills: data.skills || 'none', references: data.references_access || 'none', board: data.board_access || 'none', drawings: data.drawings_access || 'none', channelAccess }
}

// GET /workspace/workspaces — workspaces que o usuário pode acessar (próprio + convidados)
router.get('/workspaces', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const list = [{ ownerEmail: user.email, self: true, videos: 'edit', skills: 'edit', references: 'edit', board: 'edit', drawings: 'edit' }]
  const { data } = await supa.from('workspace_collaborators').select('*').eq('member_email', (user.email || '').toLowerCase())
  for (const c of data || []) {
    const any =
      (c.videos_access && c.videos_access !== 'none') ||
      (c.skills && c.skills !== 'none') ||
      (c.references_access && c.references_access !== 'none') ||
      (c.board_access && c.board_access !== 'none') ||
      (c.drawings_access && c.drawings_access !== 'none')
    if (any) list.push({ ownerEmail: c.owner_email, self: false, videos: c.videos_access || 'none', skills: c.skills || 'none', references: c.references_access || 'none', board: c.board_access || 'none', drawings: c.drawings_access || 'none' })
  }
  res.json({ workspaces: list })
})

// GET /workspace/snapshot[?owner=] — lê os dados do workspace (com permissão)
router.get('/snapshot', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const access = await resolveAccess(supa, user, req.query.owner)
  if (!access) return res.status(403).json({ error: 'forbidden', message: 'Sem acesso a este workspace.' })
  const ownerId = access.self ? user.id : await userIdByEmail(supa, access.owner)
  if (!ownerId) return res.status(404).json({ error: 'owner_not_found' })

  const out = {}
  const fetchBy = async (table, col, ids) => {
    if (!ids.length) return []
    const { data = [] } = await supa.from(table).select('*').in(col, ids)
    return data
  }
  const byOwner = async (table, col = 'user_id') => (await supa.from(table).select('*').eq(col, ownerId)).data || []

  // Os quatro ramos são independentes entre si → rodam em PARALELO (cada um
  // mantém a ordem interna que a dependência de FK exige). Corta bastante a
  // latência do 1º carregamento (antes eram ~10 consultas em série).
  await Promise.all([
    // Vídeos: dono, ou colaborador com acesso a vídeos.
    (async () => {
      if (!(access.self || access.videos !== 'none')) return
      let { data: channels = [] } = await supa.from('channels').select('*').eq('owner_id', ownerId)
      // Escopo por canal: colaborador restrito só recebe os canais liberados
      // (tanto os de 'view' quanto os de 'edit').
      if (!access.self && access.channelAccess) {
        const allow = new Set(Object.keys(access.channelAccess))
        channels = channels.filter((c) => allow.has(c.id))
      }
      const channelIds = channels.map((c) => c.id)
      out.channels = channels
      const [buttons, videos] = await Promise.all([
        fetchBy('channel_custom_buttons', 'channel_id', channelIds),
        fetchBy('channel_videos', 'channel_id', channelIds),
      ])
      out.channelButtons = buttons
      out.videos = videos
      const videoIds = videos.map((v) => v.id)
      const [scripts, seo] = await Promise.all([
        fetchBy('video_scripts', 'video_id', videoIds),
        fetchBy('video_seo_reports', 'video_id', videoIds),
      ])
      out.scripts = scripts
      out.seoReports = seo
    })(),
    // Referências: dono, ou colaborador com acesso a referências.
    (async () => {
      if (!(access.self || access.references !== 'none')) return
      const folders = await byOwner('reference_folders')
      out.referenceFolders = folders
      const refs = await fetchBy('reference_channels', 'folder_id', folders.map((f) => f.id))
      // Colaborador só recebe as referências que o dono deixou visíveis pra ele.
      out.referenceChannels = refs.filter((r) => canSeeRow(r, user.email, access.self))
    })(),
    // Quadro de Ideias: dono, ou colaborador com acesso ao quadro.
    (async () => {
      if (!(access.self || access.board !== 'none')) return
      const [spaces, columns] = await Promise.all([byOwner('board_spaces'), byOwner('board_columns')])
      out.boardSpaces = spaces
      out.boardColumns = columns
      const allCards = await fetchBy('board_cards', 'column_id', columns.map((c) => c.id))
      // Colaborador só vê os cards liberados; a checklist segue os cards visíveis.
      const cards = allCards.filter((c) => canSeeRow(c, user.email, access.self))
      out.boardCards = cards
      out.checklistItems = await fetchBy('board_card_checklist_items', 'card_id', cards.map((c) => c.id))
    })(),
    // Prompts + categorias: dono, ou colaborador com acesso a Skills (a biblioteca
    // de prompts segue o acesso "Skills" do workspace).
    (async () => {
      if (!(access.self || access.skills !== 'none')) return
      const [cats, prompts] = await Promise.all([byOwner('prompt_categories'), byOwner('prompts')])
      out.promptCategories = cats
      out.prompts = prompts
    })(),
    // Coleções PESSOAIS do dono (transcrições, análises da Dobra): só no próprio workspace.
    (async () => {
      if (!access.self) return
      const [transcriptions, niche] = await Promise.all([byOwner('transcriptions'), byOwner('niche_doubling_analyses')])
      out.transcriptions = transcriptions
      out.nicheAnalyses = niche
    })(),
  ])

  const byKey = Object.fromEntries(CONFIG.map((c) => [c.key, c]))
  const snapshot = {}
  for (const [key, rows] of Object.entries(out)) {
    const cfg = byKey[key]
    snapshot[key] = cfg ? rows.map((r) => toRec(r, cfg)) : rows
  }
  res.json({ migrated: (out.channels?.length || 0) > 0 || (out.prompts?.length || 0) > 0 || !access.self, owner: access.owner, self: access.self, access, snapshot })
})

export default router
