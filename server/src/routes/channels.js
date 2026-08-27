import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { ytFetch } from '../lib/youtube.js'

const router = Router()

// -- mapeamento linha do banco <-> objeto do client -------------------------
function toRow(c) {
  return {
    id: c.id,
    title: c.title ?? null,
    description: c.description ?? null,
    avatar: c.avatar ?? null,
    country: c.country ?? null,
    published_at: c.publishedAt ?? null,
    subscribers: Number(c.subscribers) || 0,
    views: Number(c.views) || 0,
    video_count: Number(c.videoCount) || 0,
    topics: Array.isArray(c.topics) ? c.topics : [],
    category: (Array.isArray(c.topics) && c.topics[0]) || 'Outros',
    avg_views: c.avgViews ?? null,
    engagement: c.engagement ?? null,
    last_upload_days_ago: c.lastUploadDaysAgo ?? null,
    vids_per_month: c.vidsPerMonth ?? null,
    views_per_month: c.viewsPerMonth ?? null,
    recent_videos: c.recentVideos ?? [],
    updated_at: new Date().toISOString(),
  }
}

function toClient(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    avatar: r.avatar,
    country: r.country,
    publishedAt: r.published_at,
    subscribers: Number(r.subscribers) || 0,
    views: Number(r.views) || 0,
    videoCount: Number(r.video_count) || 0,
    topics: r.topics || [],
    avgViews: r.avg_views,
    engagement: r.engagement,
    lastUploadDaysAgo: r.last_upload_days_ago,
    vidsPerMonth: r.vids_per_month,
    viewsPerMonth: r.views_per_month,
    recentVideos: r.recent_videos || [],
    addedAt: r.added_at ? new Date(r.added_at).getTime() : undefined,
  }
}

function requireSupabase(res) {
  const supa = supabaseAdmin()
  if (!supa) {
    res.status(400).json({ error: 'supabase_not_configured', message: 'Configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    return null
  }
  return supa
}

// Identifica o usuário pelo token (Bearer). A base global é alimentada pelo Niche
// Finder de qualquer usuário LOGADO — mas nunca por um anônimo (anti-vandalismo).
async function getUser(req, supa) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await supa.auth.getUser(token)
  return data?.user || null
}

// POST /api/channels/upsert  { channels: [...] } — grava os canais na base global.
// Exige usuário logado: a base é colaborativa (qualquer conta contribui), mas
// um anônimo não pode poluir/sobrescrever a base compartilhada.
router.post('/upsert', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const list = Array.isArray(req.body?.channels) ? req.body.channels.filter((c) => c && c.id).slice(0, 60) : []
  if (!list.length) return res.json({ upserted: 0 })
  const { error } = await supa.from('niche_channels').upsert(list.map(toRow), { onConflict: 'id' })
  if (error) return res.status(500).json({ error: 'upsert_failed', message: error.message })
  res.json({ upserted: list.length })
})

const daysAgoIso = (d) => new Date(Date.now() - d * 86_400_000).toISOString()

// GET /api/channels/list — leitura paginada + filtrada (server-side).
router.get('/list', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { trend = 'all', category, q, subMin, subMax, viewMin, viewMax, monetized, sort = 'views', page = '0', pageSize = '60' } = req.query
  const p = Math.max(0, Number(page) || 0)
  const ps = Math.min(120, Math.max(10, Number(pageSize) || 60))

  let query = supa.from('niche_channels').select('*', { count: 'exact' })

  // Tendências (mesma matemática das abas, feita no banco)
  if (trend === 'exploding') query = query.gte('published_at', daysAgoIso(15)).gte('views', 100000)
  else if (trend === 'rising') query = query.gte('published_at', daysAgoIso(15)).gte('views', 50000).lt('views', 100000)
  else if (trend === 'traction') query = query.lte('published_at', daysAgoIso(15)).gte('published_at', daysAgoIso(60)).gte('views', 500000)
  else if (trend === 'potential') query = query.lte('published_at', daysAgoIso(15)).gte('published_at', daysAgoIso(60)).gte('views', 100000).lt('views', 500000)
  else if (trend === 'recent') query = query.lte('published_at', daysAgoIso(60)).gte('published_at', daysAgoIso(90)).gte('views', 200000)
  else if (trend === 'smallbig') query = query.lt('subscribers', 1000).gt('views', 50000)
  else if (trend === 'new') query = query.gte('published_at', daysAgoIso(30)).lt('subscribers', 1000)
  else if (trend === 'outlier') query = query.or('subscribers.gte.5000000,views.gte.100000000')

  if (category) query = query.eq('category', category)
  if (q) query = query.ilike('title', `%${q}%`)
  if (subMin) query = query.gte('subscribers', Number(subMin))
  if (subMax) query = query.lte('subscribers', Number(subMax))
  if (viewMin) query = query.gte('views', Number(viewMin))
  if (viewMax) query = query.lte('views', Number(viewMax))
  if (monetized === '1') query = query.gte('subscribers', 1000).gte('views', 100000)

  const sortCol =
    { views: 'views', subscribers: 'subscribers', avgViews: 'avg_views', videoCount: 'video_count', engagement: 'engagement', viewsPerMonth: 'views_per_month', newest: 'published_at' }[sort] || 'views'
  query = query.order(sortCol, { ascending: false, nullsFirst: false }).range(p * ps, p * ps + ps - 1)

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: 'list_failed', message: error.message })
  res.json({ results: (data || []).map(toClient), total: count || 0, page: p, pageSize: ps })
})

// GET /api/channels/categories — agregação global por categoria (acordeão "Por Categoria").
// Usa a função SQL niche_category_stats() (ver supabase/niche_category_stats.sql).
router.get('/categories', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { data, error } = await supa.rpc('niche_category_stats')
  if (error) return res.status(500).json({ error: 'categories_failed', message: error.message })
  const categories = (data || [])
    .map((r) => ({ category: r.category || 'Outros', count: Number(r.count) || 0, views: Number(r.views) || 0 }))
    .filter((r) => r.count > 0)
  res.json({ categories })
})

// GET /api/channels/stats — contagem global + novos nesta semana (visível a todos).
router.get('/stats', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { count: total } = await supa.from('niche_channels').select('*', { count: 'exact', head: true })
  const { count: week } = await supa.from('niche_channels').select('*', { count: 'exact', head: true }).gte('added_at', daysAgoIso(7))
  res.json({ total: total || 0, thisWeek: week || 0 })
})

// GET /api/channels/removed — canais da base do Niche Finder que o cron de
// monitoramento marcou como removidos/encerrados no YouTube. Devolve nome e
// foto de perfil PRESERVADOS de quando o canal ainda estava no ar. Leitura.
router.get('/removed', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { data, error } = await supa
    .from('niche_channels')
    .select('id, title, avatar, subscribers, views, video_count, category, topics, removed_at')
    .eq('is_removed', true)
    .order('removed_at', { ascending: false })
    .limit(500)
  if (error) return res.status(500).json({ error: 'removed_failed', message: error.message })
  const channels = (data || []).map((r) => ({
    youtubeChannelId: r.id,
    name: r.title || r.id,
    avatar: r.avatar || null,
    subs: Number(r.subscribers) || 0,
    views: Number(r.views) || 0,
    videos: Number(r.video_count) || 0,
    niche: (Array.isArray(r.topics) && r.topics[0]) || r.category || 'Other',
    removedAt: r.removed_at,
  }))
  res.json({ channels })
})

// ---------------------------------------------------------------------------
// Monitoramento diário da base do Niche Finder (Vercel Cron).
// Roda no SERVIDOR sem ninguém no site: varre a base inteira checando quais
// canais foram removidos/encerrados no YouTube e marca is_removed na base
// global. Protegido por CRON_SECRET.
//
// BYOK: normalmente as chaves nunca ficam no servidor. Exceção CONTROLADA aqui:
// o cron usa SÓ as chaves da conta de FUNDADOR (VITE_FOUNDER_EMAIL / MONITOR_KEYS_EMAIL),
// lidas da tabela user_settings via service-role. As chaves de qualquer outro
// usuário NUNCA são tocadas, e as chaves nunca são logadas nem retornadas.
// ---------------------------------------------------------------------------

// Chaves YouTube do fundador (nunca logadas). [] se não houver.
async function founderYtKeys(supa) {
  const email = (process.env.MONITOR_KEYS_EMAIL || process.env.VITE_FOUNDER_EMAIL || '').split(',')[0].trim().toLowerCase()
  if (!email) return []
  let uid = null
  for (let page = 1; page <= 25 && !uid; page++) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) break
    const u = data.users.find((x) => (x.email || '').toLowerCase() === email)
    if (u) uid = u.id
    if (data.users.length < 200) break
  }
  if (!uid) return []
  const { data } = await supa.from('user_settings').select('keys').eq('user_id', uid).maybeSingle()
  const ytKeys = data?.keys?.ytKeys
  return Array.isArray(ytKeys) ? ytKeys.filter((k) => typeof k === 'string' && k.trim()) : []
}

// GET /api/channels/monitor — varredura diária (Vercel Cron).
router.get('/monitor', async (req, res) => {
  // Fail-closed: sem CRON_SECRET configurado, a rota NUNCA roda (gasta chave do
  // fundador) — diferente do purge-trash, que é inócuo. Só o Vercel Cron passa.
  const secret = process.env.CRON_SECRET
  if (!secret || (req.headers.authorization || '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })
  const supa = requireSupabase(res)
  if (!supa) return

  const keys = await founderYtKeys(supa)
  if (!keys.length) return res.status(400).json({ error: 'no_founder_keys', message: 'Nenhuma chave YouTube na conta de fundador (user_settings).' })

  // Só checa quem ainda não foi checado HOJE (permite retomar entre execuções).
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00Z'
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const MAX_BATCHES = Number(process.env.MONITOR_MAX_BATCHES || 300) // 300 * 50 = 15k canais/dia

  let checked = 0
  let removed = 0
  let batches = 0
  for (; batches < MAX_BATCHES; batches++) {
    const { data: rows, error } = await supa
      .from('niche_channels')
      .select('id')
      .eq('is_removed', false)
      .or(`last_checked_at.is.null,last_checked_at.lt.${todayStart}`)
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(50)
    if (error) return res.status(500).json({ error: 'query_failed', message: error.message })
    if (!rows?.length) break

    const ids = rows.map((r) => r.id)
    let found
    try {
      found = await ytFetch(keys, 'channels', { part: 'id', id: ids.join(','), maxResults: 50 })
    } catch (err) {
      // Cota esgotada ou erro de API: para de forma graciosa; retoma amanhã/no próximo run.
      return res.json({ ok: true, checked, removed, batches, stopped: err?.code || 'yt_error' })
    }
    const foundIds = new Set((found.items || []).map((i) => i.id))
    const goneIds = ids.filter((id) => !foundIds.has(id))
    const aliveIds = ids.filter((id) => foundIds.has(id))

    if (aliveIds.length) await supa.from('niche_channels').update({ last_checked_at: now }).in('id', aliveIds)
    if (goneIds.length) {
      await supa.from('niche_channels').update({ last_checked_at: now, is_removed: true, removed_at: today }).in('id', goneIds)
      removed += goneIds.length
    }
    checked += ids.length
  }

  res.json({ ok: true, checked, removed, batches })
})

export default router
