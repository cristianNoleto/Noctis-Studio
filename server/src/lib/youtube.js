import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Interceptor central da YouTube Data API v3 com rotação automática de chaves.
// As chaves chegam por request (BYOK, header x-yt-keys) e NUNCA são persistidas.
// Estado de cota fica em memória, keyed por hash da chave, e reseta à meia-noite
// no horário do Pacífico (reset oficial de cota do Google).
// ---------------------------------------------------------------------------

const exhausted = new Map() // hash da chave -> timestamp de expiração do bloqueio

function keyHash(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function nextPacificMidnight() {
  const now = new Date()
  const ptNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }))
  const offset = now.getTime() - ptNow.getTime()
  const midnight = new Date(ptNow)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() + offset
}

function isExhausted(key) {
  const until = exhausted.get(keyHash(key))
  if (!until) return false
  if (Date.now() >= until) {
    exhausted.delete(keyHash(key))
    return false
  }
  return true
}

export class YouTubeError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

export function parseKeys(req) {
  try {
    const keys = JSON.parse(req.headers['x-yt-keys'] || '[]')
    return Array.isArray(keys) ? keys.filter((k) => typeof k === 'string' && k.trim()) : []
  } catch {
    return []
  }
}

// Executa uma chamada à API tentando cada chave disponível; em erro de cota
// (403 quotaExceeded/dailyLimitExceeded) marca a chave como esgotada e avança
// automaticamente para a próxima, refazendo a requisição de forma transparente.
export async function ytFetch(keys, endpoint, params) {
  if (!keys.length) throw new YouTubeError('missing_yt_keys')
  const usable = keys.filter((k) => !isExhausted(k))
  if (!usable.length) throw new YouTubeError('all_keys_exhausted')

  let lastError = null
  for (const key of usable) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
    }
    url.searchParams.set('key', key)

    const res = await fetch(url)
    if (res.ok) return res.json()

    const body = await res.json().catch(() => ({}))
    const reason = body?.error?.errors?.[0]?.reason || ''
    if (res.status === 403 && /quota|dailyLimit|rateLimit/i.test(reason)) {
      exhausted.set(keyHash(key), nextPacificMidnight())
      lastError = new YouTubeError('all_keys_exhausted')
      continue // rotação: tenta a próxima chave
    }
    if (res.status === 400 || res.status === 403) {
      throw new YouTubeError('invalid_key', body?.error?.message)
    }
    throw new YouTubeError('youtube_error', body?.error?.message || `HTTP ${res.status}`)
  }
  throw lastError || new YouTubeError('all_keys_exhausted')
}

// Estado das chaves (para a aba de APIs mostrar quais estão esgotadas hoje).
export function keysStatus(keys) {
  return keys.map((key, i) => ({
    slot: i + 1,
    exhausted: isExhausted(key),
  }))
}

// ---------------------------------------------------------------------------
// Helpers de alto nível
// ---------------------------------------------------------------------------

// Aceita: URL completa, @handle, ID UC..., ou nome livre (fallback: busca).
export async function resolveChannel(keys, query) {
  let q = query.trim()
  try {
    const url = new URL(q.startsWith('http') ? q : `https://${q}`)
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      const path = url.pathname.replace(/\/+$/, '')
      if (path.startsWith('/@')) q = path.slice(1)
      else if (path.startsWith('/channel/')) q = path.split('/')[2]
      else if (path.startsWith('/user/') || path.startsWith('/c/')) q = path.split('/')[2]
    }
  } catch {
    // não era URL — segue com o texto cru
  }

  const part = 'snippet,statistics'
  let data
  if (q.startsWith('@')) {
    data = await ytFetch(keys, 'channels', { part, forHandle: q })
  } else if (/^UC[\w-]{20,}$/.test(q)) {
    data = await ytFetch(keys, 'channels', { part, id: q })
  } else {
    data = await ytFetch(keys, 'channels', { part, forHandle: `@${q}` })
    if (!data.items?.length) {
      const search = await ytFetch(keys, 'search', { part: 'snippet', type: 'channel', q, maxResults: 1 })
      const id = search.items?.[0]?.snippet?.channelId
      if (id) data = await ytFetch(keys, 'channels', { part, id })
    }
  }

  const item = data.items?.[0]
  if (!item) throw new YouTubeError('channel_not_found')
  return channelToJson(item)
}

// Mapa dos tópicos do YouTube (topicDetails → categorias em PT)
const TOPIC_LABELS = {
  Music: 'Música',
  'Pop_music': 'Música',
  'Rock_music': 'Música',
  'Hip_hop_music': 'Música',
  'Electronic_music': 'Música',
  'Country_music': 'Música',
  'Religious_music': 'Música Religiosa',
  'Video_game_culture': 'Games',
  'Action_game': 'Games',
  'Role-playing_video_game': 'Games',
  Sport: 'Esportes',
  'Association_football': 'Futebol',
  Entertainment: 'Entretenimento',
  Humour: 'Comédia',
  Film: 'Filmes',
  'Television_program': 'TV',
  'Performing_arts': 'Artes',
  'Lifestyle_(sociology)': 'Lifestyle',
  'Physical_fitness': 'Fitness',
  Health: 'Saúde',
  Food: 'Comida',
  Cooking: 'Culinária',
  Tourism: 'Viagem',
  Vehicles: 'Veículos',
  'Motor_vehicle': 'Veículos',
  'Physical_attractiveness': 'Beleza',
  Fashion: 'Moda',
  Hobby: 'Hobbies',
  Pet: 'Pets',
  Technology: 'Tecnologia',
  Knowledge: 'Educação',
  Society: 'Sociedade',
  Politics: 'Política',
  Religion: 'Religião',
  Christianity: 'Cristão',
  Business: 'Negócios',
  Military: 'Militar',
  History: 'História',
}

function parseTopics(item) {
  const urls = item.topicDetails?.topicCategories || []
  const labels = urls
    .map((u) => decodeURIComponent(u.split('/wiki/')[1] || ''))
    .filter(Boolean)
    .map((slug) => TOPIC_LABELS[slug] || slug.replaceAll('_', ' '))
  return [...new Set(labels)]
}

export function channelToJson(item) {
  return {
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description,
    avatar: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    country: item.snippet.country || null,
    publishedAt: item.snippet.publishedAt,
    subscribers: Number(item.statistics?.subscriberCount ?? 0),
    views: Number(item.statistics?.viewCount ?? 0),
    videoCount: Number(item.statistics?.videoCount ?? 0),
    topics: parseTopics(item),
  }
}

// Métricas dos últimos vídeos de um canal: views médias + engajamento real.
export async function channelRecentMetrics(keys, channelId, uploadsPlaylistId) {
  let playlistId = uploadsPlaylistId
  if (!playlistId) {
    const det = await ytFetch(keys, 'channels', { part: 'contentDetails', id: channelId })
    playlistId = det.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  }
  if (!playlistId) return { avgViews: null, engagement: null, recentVideos: [] }

  const items = await ytFetch(keys, 'playlistItems', { part: 'contentDetails', playlistId, maxResults: 10 })
  const ids = (items.items || []).map((i) => i.contentDetails.videoId).join(',')
  if (!ids) return { avgViews: null, engagement: null, recentVideos: [] }

  const vids = await ytFetch(keys, 'videos', { part: 'statistics,snippet', id: ids })
  const stats = (vids.items || [])
    .map((v) => ({
      id: v.id,
      title: v.snippet.title,
      publishedAt: v.snippet.publishedAt,
      thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url,
      views: Number(v.statistics?.viewCount ?? 0),
      likes: Number(v.statistics?.likeCount ?? 0),
      comments: Number(v.statistics?.commentCount ?? 0),
    }))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  if (!stats.length) return { avgViews: null, engagement: null, recentVideos: [] }

  const totalViews = stats.reduce((s, v) => s + v.views, 0)
  const totalInteractions = stats.reduce((s, v) => s + v.likes + v.comments, 0)

  // Cadência de postagem estimada pelos últimos uploads
  const newest = new Date(stats[0].publishedAt).getTime()
  const oldest = new Date(stats[stats.length - 1].publishedAt).getTime()
  const spanDays = Math.max(1, (newest - oldest) / 86_400_000)
  const vidsPerMonth = stats.length > 1 ? +((stats.length / spanDays) * 30).toFixed(1) : null
  const avgViews = Math.round(totalViews / stats.length)

  return {
    avgViews,
    engagement: totalViews > 0 ? +((totalInteractions / totalViews) * 100).toFixed(2) : null,
    lastUploadDaysAgo: Math.max(0, Math.round((Date.now() - newest) / 86_400_000)),
    vidsPerMonth,
    viewsPerMonth: vidsPerMonth != null ? Math.round(avgViews * vidsPerMonth) : null,
    recentVideos: stats,
  }
}

export function parseISODuration(iso) {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0)
}
