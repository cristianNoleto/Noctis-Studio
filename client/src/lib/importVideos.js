import { api } from './api'
import { db } from './db'

export const VIDEO_STEPS_DONE = {
  titulo: true,
  roteiro: true,
  audio: true,
  thumbnail: true,
  renderizado: true,
  publicado: true,
}

// Importa TODOS os vídeos já publicados de um canal do YouTube (paginado),
// criando registros com thumb, título, data, link e etapas concluídas.
// Usado no botão "Importar do YouTube" e automaticamente ao criar um canal
// importado. Retorna a quantidade de vídeos novos inseridos.
export async function importChannelVideos(channelId, youtubeChannelId, onProgress) {
  const all = []
  let token = ''
  do {
    onProgress?.(`Buscando vídeos publicados... (${all.length})`)
    const { videos: page, nextPageToken } = await api.youtube.channelVideos(youtubeChannelId, token)
    all.push(...page)
    token = nextPageToken
  } while (token)

  // Mais antigo = Vídeo 1
  all.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))
  const existing = db.all('videos').filter((v) => v.channelId === channelId)
  const existingIds = new Set(existing.map((v) => v.ytVideoId).filter(Boolean))
  const maxNumber = Math.max(0, ...existing.map((v) => v.videoNumber || 0))

  let n = 0
  let inserted = 0
  for (const v of all) {
    n++
    if (!v.id || existingIds.has(v.id)) continue
    inserted++
    db.insert('videos', {
      channelId,
      ytVideoId: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnail,
      publishedAt: v.publishedAt,
      youtubeUrl: `https://youtube.com/watch?v=${v.id}`,
      status: 'published',
      imported: true,
      steps: { ...VIDEO_STEPS_DONE },
      // Sem numeração local prévia, o mais antigo vira "Vídeo 1"; com
      // numeração existente, continua a partir do maior número.
      videoNumber: maxNumber > 0 ? maxNumber + inserted : n,
    })
  }
  return inserted
}
