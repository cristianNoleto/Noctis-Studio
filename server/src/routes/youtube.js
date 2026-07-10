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

// Enriquecimento com concorrência limitada (50 canais → chunks paralelos)
async function enrichChannels(keys, items) {
  const enriched = new Array(items.length)
  const CONCURRENCY = 8
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      const item = items[i]
      const base = channelToJson(item)
      let metrics = { avgViews: null, engagement: null, recentVideos: [] }
      try {
        metrics = await channelRecentMetrics(keys, item.id, item.contentDetails?.relatedPlaylists?.uploads)
      } catch {
        // sem métricas detalhadas ainda dá pra listar o canal
      }
      enriched[i] = {
        ...base,
        avgViews: metrics.avgViews,
        engagement: metrics.engagement,
        lastUploadDaysAgo: metrics.lastUploadDaysAgo ?? null,
        vidsPerMonth: metrics.vidsPerMonth ?? null,
        viewsPerMonth: metrics.viewsPerMonth ?? null,
        recentVideos: (metrics.recentVideos || []).slice(0, 3).map((v) => ({ id: v.id, thumbnail: v.thumbnail, views: v.views })),
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker))
  return enriched
}

// GET /api/youtube/search-channels?q=&pageToken=  (Niche Finder — 50 por página)
router.get('/search-channels', async (req, res) => {
  try {
    const keys = parseKeys(req)
    const { q, minSubs, maxSubs, language, pageToken } = req.query
    const data = await cached(`sc:${q}:${language || ''}:${pageToken || ''}`, 30 * 60_000, async () => {
      const search = await ytFetch(keys, 'search', {
        part: 'snippet',
        type: 'channel',
        q,
        maxResults: 50,
        pageToken: pageToken || undefined,
        relevanceLanguage: language || undefined,
      })
      const ids = (search.items || []).map((i) => i.snippet.channelId)
      if (!ids.length) return { results: [], nextPageToken: null }
      // channels.list aceita até 50 ids numa chamada só
      const channels = await ytFetch(keys, 'channels', { part: 'snippet,statistics,contentDetails,topicDetails', id: ids.join(',') })
      const results = await enrichChannels(keys, channels.items || [])
      return { results, nextPageToken: search.nextPageToken || null }
    })

    let results = data.results
    if (minSubs) results = results.filter((c) => c.subscribers >= Number(minSubs))
    if (maxSubs) results = results.filter((c) => c.subscribers <= Number(maxSubs))
    res.json({ results, nextPageToken: data.nextPageToken })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /api/youtube/check-channels?ids=UC1,UC2,...  (detecção de canais removidos)
// Devolve quais ids ainda EXISTEM no YouTube — os ausentes foram removidos/
// encerrados. Sem cache: o objetivo é justamente detectar mudanças.
router.get('/check-channels', async (req, res) => {
  try {
    const keys = parseKeys(req)
    const ids = String(req.query.ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50)
    if (!ids.length) return res.json({ found: [] })
    const data = await ytFetch(keys, 'channels', { part: 'id', id: ids.join(','), maxResults: 50 })
    res.json({ found: (data.items || []).map((i) => i.id) })
  } catch (err) {
    handleError(res, err)
  }
})

// GET /api/youtube/channel-videos?id=UC...&pageToken=  (importação de vídeos publicados)
router.get('/channel-videos', async (req, res) => {
  try {
    const keys = parseKeys(req)
    const channelId = req.query.id
    const pageToken = req.query.pageToken || ''
    const data = await cached(`cv:${channelId}:${pageToken}`, 10 * 60_000, async () => {
      const det = await ytFetch(keys, 'channels', { part: 'contentDetails', id: channelId })
      const uploads = det.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
      if (!uploads) return { videos: [], nextPageToken: null }
      const items = await ytFetch(keys, 'playlistItems', {
        part: 'snippet',
        playlistId: uploads,
        maxResults: 50,
        pageToken: pageToken || undefined,
      })
      const videos = (items.items || []).map((i) => ({
        id: i.snippet.resourceId?.videoId,
        title: i.snippet.title,
        thumbnail: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url,
        publishedAt: i.snippet.publishedAt,
      }))
      return { videos, nextPageToken: items.nextPageToken || null }
    })
    res.json(data)
  } catch (err) {
    handleError(res, err)
  }
})

// GET /api/youtube/viral?q=&period=&minViews=&durMin=&durMax=  (Vídeos Virais)
router.get('/viral', async (req, res) => {
  try {
    const keys = parseKeys(req)
    const { q, period, minViews, durMinSec, after, before } = req.query

    let publishedAfter
    const hours = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[period]
    if (hours) publishedAfter = new Date(Date.now() - hours * 3600_000).toISOString()
    if (after) publishedAfter = new Date(`${after}T00:00:00Z`).toISOString()
    const publishedBefore = before ? new Date(`${before}T23:59:59Z`).toISOString() : undefined

    const data = await cached(`viral:${q}:${period || ''}:${after || ''}:${before || ''}`, 15 * 60_000, async () => {
      const search = await ytFetch(keys, 'search', {
        part: 'snippet',
        type: 'video',
        q: q || undefined,
        order: 'viewCount',
        publishedAfter,
        publishedBefore,
        maxResults: 25,
      })
      const videoIds = (search.items || []).map((i) => i.id.videoId).join(',')
      if (!videoIds) return []
      const videos = await ytFetch(keys, 'videos', { part: 'snippet,statistics,contentDetails,topicDetails', id: videoIds })

      const channelIds = [...new Set((videos.items || []).map((v) => v.snippet.channelId))].join(',')
      const channels = channelIds ? await ytFetch(keys, 'channels', { part: 'statistics', id: channelIds }) : { items: [] }
      const subsById = Object.fromEntries((channels.items || []).map((c) => [c.id, Number(c.statistics?.subscriberCount ?? 0)]))

      return (videos.items || []).map((v) => {
        const views = Number(v.statistics?.viewCount ?? 0)
        const likes = Number(v.statistics?.likeCount ?? 0)
        const comments = Number(v.statistics?.commentCount ?? 0)
        const hoursSince = Math.max(1, (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 3600_000)
        const subs = subsById[v.snippet.channelId] || 0
        const vph = Math.round(views / hoursSince)
        // Engajamento % = (likes + comentários) / views, como no original
        const engagementPct = views > 0 ? +(((likes + comments) / views) * 100).toFixed(2) : null
        // Score Viral™ (0-100): mistura alcance vs. inscritos, VPH e engajamento
        const reach = subs > 0 ? Math.min(40, Math.log10(Math.max(1, views / subs)) * 20 + 20) : 20
        const speed = Math.min(35, Math.log10(Math.max(1, vph)) * 10)
        const engScore = Math.min(25, (engagementPct || 0) * 4)
        const viralScore = Math.round(reach + speed + engScore)
        return {
          id: v.id,
          title: v.snippet.title,
          thumbnail: v.snippet.thumbnails?.medium?.url,
          channelId: v.snippet.channelId,
          channelTitle: v.snippet.channelTitle,
          publishedAt: v.snippet.publishedAt,
          durationSeconds: parseISODuration(v.contentDetails?.duration),
          views,
          likes,
          comments,
          vph,
          channelSubs: subs,
          engagement: engagementPct,
          viralScore,
        }
      })
    })

    let results = data
    if (minViews) results = results.filter((v) => v.views >= Number(minViews))
    if (durMinSec) results = results.filter((v) => v.durationSeconds >= Number(durMinSec))
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
