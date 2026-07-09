import { Router } from 'express'
import {
  ytFetch,
  parseKeys,
  keysStatus,
  resolveChannel,
  channelToJson,
  channelRecentMetrics,
  parseISODuration,
  YouTubeError,
} from '../lib/youtube.js'

const router = Router()

// Cache simples em memória (TTL) — a rotação multiplica a cota, não a torna
// infinita; buscas repetidas não devem gastar unidades de novo.
const cache = new Map()
function cached(key, ttlMs, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data)
  return fn().then((data) => {
    cache.set(key, { ts: Date.now(), data })
    if (cache.size > 500) cache.delete(cache.keys().next().value)
    return data
  })
}

function handleError(res, err) {
  if (err instanceof YouTubeError) {
    const status = err.code === 'all_keys_exhausted' ? 429 : err.code === 'missing_yt_keys' ? 400 : 502
    return res.status(status).json({ error: err.code, message: err.message })
  }
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
}

// GET /api/youtube/keys-status — quais slots estão esgotados hoje
router.get('/keys-status', (req, res) => {
  res.json({ keys: keysStatus(parseKeys(req)) })
})

// GET /api/youtube/channel?q=<url|handle|id|nome>
router.get('/channel', async (req, res) => {
  try {
    const keys = parseKeys(req)
    const data = await cached(`ch:${req.query.q}`, 10 * 60_000, () => resolveChannel(keys, String(req.query.q || '')))
    res.json(data)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /api/youtube/channel-stats?id=UC...
router.get('/channel-stats', async (req, res) => {
  try {
    const keys = parseKeys(req)
    const data = await ytFetch(keys, 'channels', { part: 'statistics', id: req.query.id })
    const stats = data.items?.[0]?.statistics
    if (!stats) return res.status(404).json({ error: 'channel_not_found' })
    res.json({ subscribers: Number(stats.subscriberCount ?? 0), views: Number(stats.viewCount ?? 0), videoCount: Number(stats.videoCount ?? 0) })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /api/youtube/search-channels?q=&maxSubs=&minSubs=  (Niche Finder)
router.get('/search-channels', async (req, res) => {
  try {
    const keys = parseKeys(req)
    const { q, minSubs, maxSubs, language } = req.query
    const data = await cached(`sc:${q}:${language || ''}`, 30 * 60_000, async () => {
      const search = await ytFetch(keys, 'search', {
        part: 'snippet',
        type: 'channel',
        q,
        maxResults: 12,
        relevanceLanguage: language || undefined,
      })
      const ids = (search.items || []).map((i) => i.snippet.channelId).join(',')
      if (!ids) return []
      const channels = await ytFetch(keys, 'channels', { part: 'snippet,statistics,contentDetails', id: ids })
      const enriched = []
      for (const item of channels.items || []) {
        const base = channelToJson(item)
        let metrics = { avgViews: null, engagement: null }
        try {
          metrics = await channelRecentMetrics(keys, item.id, item.contentDetails?.relatedPlaylists?.uploads)
        } catch {
          // sem métricas detalhadas ainda dá pra listar o canal
        }
        enriched.push({ ...base, avgViews: metrics.avgViews, engagement: metrics.engagement })
      }
      return enriched
    })

    let results = data
    if (minSubs) results = results.filter((c) => c.subscribers >= Number(minSubs))
    if (maxSubs) results = results.filter((c) => c.subscribers <= Number(maxSubs))
    res.json({ results })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /api/youtube/viral?q=&period=&minViews=&durMin=&durMax=  (Vídeos Virais)
router.get('/viral', async (req, res) => {
  try {
    const keys = parseKeys(req)
    const { q, period, minViews, durMin, durMax } = req.query

    let publishedAfter
    const hours = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[period]
    if (hours) publishedAfter = new Date(Date.now() - hours * 3600_000).toISOString()

    const data = await cached(`viral:${q}:${period || ''}`, 15 * 60_000, async () => {
      const search = await ytFetch(keys, 'search', {
        part: 'snippet',
        type: 'video',
        q: q || undefined,
        order: 'viewCount',
        publishedAfter,
        maxResults: 25,
      })
      const videoIds = (search.items || []).map((i) => i.id.videoId).join(',')
      if (!videoIds) return []
      const videos = await ytFetch(keys, 'videos', { part: 'snippet,statistics,contentDetails', id: videoIds })

      const channelIds = [...new Set((videos.items || []).map((v) => v.snippet.channelId))].join(',')
      const channels = channelIds ? await ytFetch(keys, 'channels', { part: 'statistics', id: channelIds }) : { items: [] }
      const subsById = Object.fromEntries((channels.items || []).map((c) => [c.id, Number(c.statistics?.subscriberCount ?? 0)]))

      return (videos.items || []).map((v) => {
        const views = Number(v.statistics?.viewCount ?? 0)
        const hoursSince = Math.max(1, (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 3600_000)
        const subs = subsById[v.snippet.channelId] || 0
        return {
          id: v.id,
          title: v.snippet.title,
          thumbnail: v.snippet.thumbnails?.medium?.url,
          channelId: v.snippet.channelId,
          channelTitle: v.snippet.channelTitle,
          publishedAt: v.snippet.publishedAt,
          durationSeconds: parseISODuration(v.contentDetails?.duration),
          views,
          vph: Math.round(views / hoursSince),
          channelSubs: subs,
          engagement: subs > 0 ? +(views / subs).toFixed(2) : null, // views do vídeo / inscritos do canal
        }
      })
    })

    let results = data
    if (minViews) results = results.filter((v) => v.views >= Number(minViews))
    if (durMin) results = results.filter((v) => v.durationSeconds >= Number(durMin) * 60)
    if (durMax) results = results.filter((v) => v.durationSeconds <= Number(durMax) * 60)
    res.json({ results })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /api/youtube/top-videos?id=UC...  (Dobra de Nicho: melhores vídeos do canal semente)
router.get('/top-videos', async (req, res) => {
  try {
    const keys = parseKeys(req)
    const data = await cached(`top:${req.query.id}`, 60 * 60_000, async () => {
      const search = await ytFetch(keys, 'search', {
        part: 'snippet',
        type: 'video',
        channelId: req.query.id,
        order: 'viewCount',
        maxResults: 10,
      })
      const ids = (search.items || []).map((i) => i.id.videoId).join(',')
      if (!ids) return []
      const videos = await ytFetch(keys, 'videos', { part: 'snippet,statistics', id: ids })
      return (videos.items || []).map((v) => ({
        id: v.id,
        title: v.snippet.title,
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
      }))
    })
    res.json({ results: data })
  } catch (err) {
    handleError(res, err)
  }
})

export default router
