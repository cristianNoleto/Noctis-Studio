import { Router } from 'express'
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
  if (isUuid(rec.id)) row.id = rec.id
  if (cfg.owner) row[cfg.owner] = ownerId
  if (cfg.parent) {
    const pid = rec[cfg.parent.field]
    if (isUuid(pid)) row[cfg.parent.col] = pid
  }
  for (const [k, v] of Object.entries(rec)) {
    if (k === 'id') continue
    if (cfg.parent && k === cfg.parent.field) continue
    const col = cfg.cols[k]
    if (col) row[col] = TS_COLS.has(col) ? toIso(v) : v
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
  await ensureProfile(supa, user)
  const data = req.body?.data || {}
  const summary = {}
  for (const cfg of CONFIG) {
    const list = Array.isArray(data[cfg.key]) ? data[cfg.key] : []
    if (!list.length) { summary[cfg.key] = 0; continue }
    const rows = list.map((rec) => toRow(rec, cfg, user.id)).filter((r) => r.id) // precisa de id p/ upsert
    const { error } = await supa.from(cfg.table).upsert(rows, { onConflict: 'id' })
    summary[cfg.key] = error ? `erro: ${error.message}` : rows.length
  }
  res.json({ ok: true, owner: user.email, summary })
})

// GET /workspace/snapshot — lê os dados do dono no formato do client
router.get('/snapshot', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })

  // Ids dos filhos dependem dos pais do dono — resolvemos em cascata.
  const out = {}
  const { data: channels = [] } = await supa.from('channels').select('*').eq('owner_id', user.id)
  const channelIds = channels.map((c) => c.id)

  const fetchBy = async (table, col, ids) => {
    if (!ids.length) return []
    const { data = [] } = await supa.from(table).select('*').in(col, ids)
    return data
  }

  out.channels = channels
  out.channelButtons = await fetchBy('channel_custom_buttons', 'channel_id', channelIds)
  const videos = await fetchBy('channel_videos', 'channel_id', channelIds)
  out.videos = videos
  const videoIds = videos.map((v) => v.id)
  out.scripts = await fetchBy('video_scripts', 'video_id', videoIds)
  out.seoReports = await fetchBy('video_seo_reports', 'video_id', videoIds)

  const byOwner = async (table, col = 'user_id') => (await supa.from(table).select('*').eq(col, user.id)).data || []
  out.boardSpaces = await byOwner('board_spaces')
  const columns = await byOwner('board_columns')
  out.boardColumns = columns
  const cards = await fetchBy('board_cards', 'column_id', columns.map((c) => c.id))
  out.boardCards = cards
  out.checklistItems = await fetchBy('board_card_checklist_items', 'card_id', cards.map((c) => c.id))
  const folders = await byOwner('reference_folders')
  out.referenceFolders = folders
  out.referenceChannels = await fetchBy('reference_channels', 'folder_id', folders.map((f) => f.id))
  out.promptCategories = await byOwner('prompt_categories')
  out.prompts = await byOwner('prompts')
  out.transcriptions = await byOwner('transcriptions')
  out.nicheAnalyses = await byOwner('niche_doubling_analyses')

  // Mapeia cada tabela de volta para o shape do client
  const byKey = Object.fromEntries(CONFIG.map((c) => [c.key, c]))
  const snapshot = {}
  for (const [key, rows] of Object.entries(out)) {
    const cfg = byKey[key]
    snapshot[key] = cfg ? rows.map((r) => toRec(r, cfg)) : rows
  }
  res.json({ migrated: channels.length > 0 || (out.prompts || []).length > 0, snapshot })
})

export default router
