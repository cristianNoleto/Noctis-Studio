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
    required: { name: 'Canal' } },
  { key: 'channelButtons', table: 'channel_custom_buttons', parent: { field: 'channelId', col: 'channel_id' },
    cols: { label: 'label', url: 'url', position: 'position' }, required: { label: '', url: '', position: 0 } },
  { key: 'videos', table: 'channel_videos', parent: { field: 'channelId', col: 'channel_id' },
    cols: { title: 'title', description: 'description', tags: 'tags', thumbnailUrl: 'thumbnail_url', youtubeUrl: 'youtube_url', steps: 'steps', videoNumber: 'video_number', publishedAt: 'published_at', imported: 'imported', thumbnailConcept: 'thumbnail_concept', createdAt: 'created_at' },
    required: { title: 'Sem título' } },
  { key: 'scripts', table: 'video_scripts', parent: { field: 'videoId', col: 'video_id' },
    cols: { content: 'content' }, hasExtra: false },
  { key: 'seoReports', table: 'video_seo_reports', parent: { field: 'videoId', col: 'video_id' },
    cols: { score: 'score', report: 'report_json', createdAt: 'created_at' } },
  { key: 'boardSpaces', table: 'board_spaces', owner: 'user_id',
    cols: { name: 'name', position: 'position' }, required: { name: 'Espaço' } },
  { key: 'boardColumns', table: 'board_columns', owner: 'user_id',
    cols: { title: 'title', color: 'color', position: 'position', spaceId: 'space_id', channelId: 'channel_id' }, required: { title: 'Coluna' } },
  { key: 'boardCards', table: 'board_cards', parent: { field: 'columnId', col: 'column_id' },
    cols: { title: 'title', color: 'color', position: 'position', source: 'source', sourceRef: 'source_ref', createdAt: 'created_at' }, required: { title: '' } },
  { key: 'checklistItems', table: 'board_card_checklist_items', parent: { field: 'cardId', col: 'card_id' },
    cols: { label: 'label', done: 'done', position: 'position' }, required: { label: '', position: 0 } },
  { key: 'referenceFolders', table: 'reference_folders', owner: 'user_id',
    cols: { name: 'name', channelId: 'channel_id', createdAt: 'created_at' }, required: { name: 'Pasta' } },
  { key: 'referenceChannels', table: 'reference_channels', parent: { field: 'folderId', col: 'folder_id' },
    cols: { youtubeUrl: 'youtube_url', youtubeChannelId: 'youtube_channel_id', niche: 'niche', notes: 'notes', cachedStats: 'cached_stats', createdAt: 'created_at' }, required: { youtubeUrl: '' } },
  { key: 'promptCategories', table: 'prompt_categories', owner: 'user_id',
    cols: { name: 'name', position: 'position' }, required: { name: 'Categoria' } },
  { key: 'prompts', table: 'prompts', owner: 'user_id',
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
    if (!writable.size) return res.status(403).json({ error: 'forbidden', message: 'Sem permissão de edição.' })
  }

  const data = { ...(req.body?.data || {}) }

  // Referências sem pasta (folderId ausente) ganham uma pasta padrão do dono,
  // senão violariam a FK/são perdidas na leitura.
  const refs = Array.isArray(data.referenceChannels) ? data.referenceChannels : []
  if (refs.some((r) => !r.folderId)) {
    const defId = `noctis-default-folder-${ownerId}`
    data.referenceFolders = [...(data.referenceFolders || []), { id: defId, name: 'Referências' }]
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
    inserted['channels'] = new Set(ownChannels.map((c) => c.id))
    const chIds = ownChannels.map((c) => c.id)
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
    // Descarta filhos cujo pai não está sendo inserido (evita erro de FK no lote).
    if (cfg.parent) {
      const parentSet = inserted[PARENT_TABLE[cfg.parent.col]]
      const before = rows.length
      rows = rows.filter((r) => r[cfg.parent.col] && (!parentSet || parentSet.has(r[cfg.parent.col])))
      summary[`${cfg.key}_orfaos`] = before - rows.length || undefined
    }
    const prev = inserted[cfg.table] || new Set()
    if (!rows.length) { summary[cfg.key] = 0; inserted[cfg.table] = prev; continue }
    const { error } = await supa.from(cfg.table).upsert(rows, { onConflict: 'id' })
    if (!error) for (const r of rows) prev.add(r.id)
    inserted[cfg.table] = prev
    summary[cfg.key] = error ? `erro: ${error.message}` : rows.length
  }
  // limpa chaves _orfaos vazias
  for (const k of Object.keys(summary)) if (summary[k] === undefined) delete summary[k]
  res.json({ ok: true, owner: access.owner, self: access.self, summary })
})

// Resolve o id (auth) de um e-mail. Base pequena → listUsers.
async function userIdByEmail(supa, email) {
  const e = (email || '').toLowerCase()
  const { data } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return (data?.users || []).find((x) => (x.email || '').toLowerCase() === e)?.id || null
}

// Acesso do requester ao workspace de ownerEmail (self = próprio).
async function resolveAccess(supa, requester, ownerEmail) {
  const me = (requester.email || '').toLowerCase()
  const owner = (ownerEmail || me).toLowerCase()
  if (owner === me) return { owner, self: true, videos: 'edit', skills: 'edit', references: 'edit', board: 'edit' }
  const { data } = await supa.from('workspace_collaborators').select('*').eq('owner_email', owner).eq('member_email', me).maybeSingle()
  if (!data) return null
  return { owner, self: false, videos: data.videos_access || 'none', skills: data.skills || 'none', references: data.references_access || 'none', board: data.board_access || 'none' }
}

// GET /workspace/workspaces — workspaces que o usuário pode acessar (próprio + convidados)
router.get('/workspaces', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const list = [{ ownerEmail: user.email, self: true, videos: 'edit', skills: 'edit', references: 'edit', board: 'edit' }]
  const { data } = await supa.from('workspace_collaborators').select('*').eq('member_email', (user.email || '').toLowerCase())
  for (const c of data || []) {
    const any =
      (c.videos_access && c.videos_access !== 'none') ||
      (c.skills && c.skills !== 'none') ||
      (c.references_access && c.references_access !== 'none') ||
      (c.board_access && c.board_access !== 'none')
    if (any) list.push({ ownerEmail: c.owner_email, self: false, videos: c.videos_access || 'none', skills: c.skills || 'none', references: c.references_access || 'none', board: c.board_access || 'none' })
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

  // Vídeos: dono, ou colaborador com acesso a vídeos.
  if (access.self || access.videos !== 'none') {
    const { data: channels = [] } = await supa.from('channels').select('*').eq('owner_id', ownerId)
    const channelIds = channels.map((c) => c.id)
    out.channels = channels
    out.channelButtons = await fetchBy('channel_custom_buttons', 'channel_id', channelIds)
    const videos = await fetchBy('channel_videos', 'channel_id', channelIds)
    out.videos = videos
    const videoIds = videos.map((v) => v.id)
    out.scripts = await fetchBy('video_scripts', 'video_id', videoIds)
    out.seoReports = await fetchBy('video_seo_reports', 'video_id', videoIds)
  }
  // Referências: dono, ou colaborador com acesso a referências.
  if (access.self || access.references !== 'none') {
    const folders = await byOwner('reference_folders')
    out.referenceFolders = folders
    out.referenceChannels = await fetchBy('reference_channels', 'folder_id', folders.map((f) => f.id))
  }
  // Quadro de Ideias: dono, ou colaborador com acesso ao quadro.
  if (access.self || access.board !== 'none') {
    out.boardSpaces = await byOwner('board_spaces')
    const columns = await byOwner('board_columns')
    out.boardColumns = columns
    const cards = await fetchBy('board_cards', 'column_id', columns.map((c) => c.id))
    out.boardCards = cards
    out.checklistItems = await fetchBy('board_card_checklist_items', 'card_id', cards.map((c) => c.id))
  }
  // Coleções privadas do dono (prompts, transcrições, análises): só no próprio workspace.
  if (access.self) {
    out.promptCategories = await byOwner('prompt_categories')
    out.prompts = await byOwner('prompts')
    out.transcriptions = await byOwner('transcriptions')
    out.nicheAnalyses = await byOwner('niche_doubling_analyses')
  }

  const byKey = Object.fromEntries(CONFIG.map((c) => [c.key, c]))
  const snapshot = {}
  for (const [key, rows] of Object.entries(out)) {
    const cfg = byKey[key]
    snapshot[key] = cfg ? rows.map((r) => toRec(r, cfg)) : rows
  }
  res.json({ migrated: (out.channels?.length || 0) > 0 || (out.prompts?.length || 0) > 0 || !access.self, owner: access.owner, self: access.self, access, snapshot })
})

export default router
