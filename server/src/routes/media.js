import { Router } from 'express'

const router = Router()

// Agregador Pexels + Pixabay (BYOK). Normaliza os resultados num formato único.
// GET /api/media/search?type=image|video&q=&orientation=&page=
router.get('/search', async (req, res) => {
  const pexelsKey = req.headers['x-pexels-key']
  const pixabayKey = req.headers['x-pixabay-key']
  if (!pexelsKey && !pixabayKey) return res.status(400).json({ error: 'missing_media_keys' })

  const { type = 'image', q = '', orientation = '', page = '1' } = req.query
  const tasks = []

  if (pexelsKey) tasks.push(searchPexels(pexelsKey, { type, q, orientation, page }).catch(() => []))
  if (pixabayKey) tasks.push(searchPixabay(pixabayKey, { type, q, orientation, page }).catch(() => []))

  const lists = await Promise.all(tasks)
  // Intercala resultados das duas fontes
  const merged = []
  const max = Math.max(...lists.map((l) => l.length), 0)
  for (let i = 0; i < max; i++) {
    for (const list of lists) if (list[i]) merged.push(list[i])
  }
  // Garantia de orientação por proporção (as APIs de vídeo ignoram o parâmetro,
  // então filtramos pelas dimensões — determinístico para imagem e vídeo).
  const filtered = orientation && orientation !== 'all' ? merged.filter((m) => matchesOrientation(m, orientation)) : merged
  res.json({ results: filtered })
})

// horizontal: mais largo que alto; vertical: mais alto que largo; square: ~1:1
function matchesOrientation(item, orientation) {
  const w = Number(item.width) || 0
  const h = Number(item.height) || 0
  if (!w || !h) return true // sem dimensões, não descarta
  const ratio = w / h
  if (orientation === 'square') return ratio >= 0.85 && ratio <= 1.18
  if (orientation === 'vertical') return ratio < 0.85
  if (orientation === 'horizontal') return ratio > 1.18
  return true
}

// GET /api/media/test — valida as chaves do Pexels/Pixabay presentes nos headers
router.get('/test', async (req, res) => {
  const pexelsKey = req.headers['x-pexels-key']
  const pixabayKey = req.headers['x-pixabay-key']
  if (!pexelsKey && !pixabayKey) return res.json({ ok: false, message: 'Nenhuma chave de mídia configurada.' })
  const out = {}
  if (pexelsKey) out.pexels = await searchPexels(pexelsKey, { type: 'image', q: 'sky', orientation: '', page: '1' }).then((l) => l.length > 0).catch(() => false)
  if (pixabayKey) out.pixabay = await searchPixabay(pixabayKey, { type: 'image', q: 'sky', orientation: '', page: '1' }).then((l) => l.length > 0).catch(() => false)
  const ok = out.pexels === true || out.pixabay === true
  const details = []
  if (pexelsKey) details.push({ label: 'Pexels', ok: out.pexels === true, message: out.pexels ? 'OK' : 'falhou' })
  if (pixabayKey) details.push({ label: 'Pixabay', ok: out.pixabay === true, message: out.pixabay ? 'OK' : 'falhou' })
  res.json({ ok, ...out, message: details.map((d) => `${d.label}: ${d.message}`).join(' · '), details })
})

async function searchPexels(key, { type, q, orientation, page }) {
  const base = type === 'video' ? 'https://api.pexels.com/videos/search' : 'https://api.pexels.com/v1/search'
  const url = new URL(base)
  url.searchParams.set('query', q || 'dark')
  url.searchParams.set('per_page', '20')
  url.searchParams.set('page', page)
  if (orientation && orientation !== 'all') url.searchParams.set('orientation', orientation === 'vertical' ? 'portrait' : orientation === 'horizontal' ? 'landscape' : 'square')

  const res = await fetch(url, { headers: { Authorization: key } })
  if (!res.ok) return []
  const data = await res.json()

  if (type === 'video') {
    return (data.videos || []).map((v) => ({
      id: `px-${v.id}`,
      type: 'video',
      source: 'Pexels',
      thumb: v.image,
      width: v.width,
      height: v.height,
      duration: v.duration,
      author: v.user?.name || '',
      title: v.user?.name ? `Vídeo de ${v.user.name}` : 'Vídeo Pexels',
      keywords: '', // Pexels não expõe tags de vídeo
      files: (v.video_files || [])
        .filter((f) => f.file_type === 'video/mp4')
        .map((f) => ({ label: f.quality === 'hd' ? 'HD' : f.quality === 'uhd' ? '4K' : 'SD', width: f.width, height: f.height, url: f.link })),
      pageUrl: v.url,
    }))
  }
  return (data.photos || []).map((p) => ({
    id: `px-${p.id}`,
    type: 'image',
    source: 'Pexels',
    thumb: p.src.medium,
    width: p.width,
    height: p.height,
    author: p.photographer || '',
    title: p.alt || (p.photographer ? `Foto de ${p.photographer}` : 'Imagem Pexels'),
    keywords: p.alt || '', // descrição → base da busca "semelhantes"
    files: [
      { label: 'Original', url: p.src.original, width: p.width, height: p.height },
      { label: 'Grande', url: p.src.large2x },
      { label: 'Média', url: p.src.large },
    ],
    pageUrl: p.url,
  }))
}

async function searchPixabay(key, { type, q, orientation, page }) {
  const base = type === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/'
  const url = new URL(base)
  url.searchParams.set('key', key)
  url.searchParams.set('q', q || 'dark')
  url.searchParams.set('per_page', '20')
  url.searchParams.set('page', page)
  if (type !== 'video' && orientation && orientation !== 'all') {
    url.searchParams.set('orientation', orientation === 'vertical' ? 'vertical' : 'horizontal')
  }

  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()

  if (type === 'video') {
    return (data.hits || []).map((v) => ({
      id: `pb-${v.id}`,
      type: 'video',
      source: 'Pixabay',
      thumb: v.videos?.medium?.thumbnail || v.videos?.small?.thumbnail,
      width: v.videos?.large?.width || v.videos?.medium?.width,
      height: v.videos?.large?.height || v.videos?.medium?.height,
      duration: v.duration,
      author: v.user || '',
      title: v.tags || (v.user ? `Vídeo de ${v.user}` : 'Vídeo Pixabay'),
      keywords: v.tags || '',
      files: ['large', 'medium', 'small']
        .filter((s) => v.videos?.[s]?.url)
        .map((s) => ({ label: s === 'large' ? 'HD/4K' : s === 'medium' ? 'HD' : 'SD', width: v.videos[s].width, height: v.videos[s].height, url: v.videos[s].url })),
      pageUrl: v.pageURL,
    }))
  }
  return (data.hits || []).map((p) => ({
    id: `pb-${p.id}`,
    type: 'image',
    source: 'Pixabay',
    thumb: p.webformatURL,
    width: p.imageWidth,
    height: p.imageHeight,
    author: p.user || '',
    title: p.tags || 'Imagem Pixabay',
    keywords: p.tags || '', // tags → base da busca "semelhantes"
    files: [
      { label: 'Grande', url: p.largeImageURL, width: p.imageWidth, height: p.imageHeight },
      { label: 'Média', url: p.webformatURL },
    ],
    pageUrl: p.pageURL,
  }))
}

export default router
