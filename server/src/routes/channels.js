import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

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

// POST /api/channels/upsert  { channels: [...] } — grava os canais na base global.
router.post('/upsert', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
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

// GET /api/channels/stats — contagem global + novos nesta semana (visível a todos).
router.get('/stats', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { count: total } = await supa.from('niche_channels').select('*', { count: 'exact', head: true })
  const { count: week } = await supa.from('niche_channels').select('*', { count: 'exact', head: true }).gte('added_at', daysAgoIso(7))
  res.json({ total: total || 0, thisWeek: week || 0 })
})

export default router
