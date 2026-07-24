// ---------------------------------------------------------------------------
// Pipeline de vídeos — o status é DERIVADO das etapas (checkboxes), não salvo
// manualmente. Caminho: planejamento → produção → finalizado → agendado/publicado.
//   • só título              → planejamento
//   • roteiro/áudio/thumb    → produção
//   • renderizado            → finalizado
//   • publicado              → agendado/publicado
// Marcar/desmarcar caixinhas sobe/desce o vídeo automaticamente nas categorias.
// ---------------------------------------------------------------------------

// Etapas exigidas antes de "Agendado/Publicado" (usadas no modal de confirmação).
export const REQUIRED_STEPS = [
  ['titulo', 'Título'],
  ['roteiro', 'Roteiro'],
  ['audio', 'Áudio'],
  ['thumbnail', 'Thumbnail'],
  ['renderizado', 'Renderizado'],
]

export function deriveStatus(video) {
  const s = video?.steps || {}
  if (s.publicado) return 'scheduled_published'
  if (s.renderizado) return 'finished'
  if (s.roteiro || s.audio || s.thumbnail || s.storyboard) return 'production'
  return 'planning'
}

export function isFinalized(video) {
  const s = video?.steps || {}
  return !!(s.renderizado || s.publicado)
}

// A data de postagem definida no vídeo já passou?
export function datePassed(video) {
  return !!video?.publishedAt && new Date(video.publishedAt).getTime() <= Date.now()
}

// "Postado": finalizado E a data de postagem já passou. Antes disso fica pendente,
// mesmo finalizado/agendado. Depois da data, cai em postados automaticamente.
export function isPosted(video) {
  return isFinalized(video) && datePassed(video)
}

export function isPending(video) {
  return !isPosted(video)
}
