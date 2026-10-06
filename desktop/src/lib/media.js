// URL para mostrar um arquivo gerado (servido pelo protocolo midia:// do app).
export const mediaUrl = (p) => (p ? `midia://f/${encodeURIComponent(p)}` : '')
export const isVideo = (p) => /\.(mp4|webm|mov|m4v)$/i.test(p || '')

export const IMAGE_MODELS = [
  { value: 'nano_pro', label: 'Nano Banana Pro' },
  { value: 'nano_2', label: 'Nano Banana 2' },
  { value: 'nano_lite', label: 'Nano Banana 2 Lite' },
]
export const VIDEO_MODELS = [
  { value: 'fast', label: 'Veo 3.1 - Fast' },
  { value: 'quality', label: 'Veo 3.1 - Quality' },
  { value: 'lite', label: 'Veo 3.1 - Lite' },
  { value: 'relaxed', label: 'Veo 3.1 - Lite [Lower Priority]' },
  { value: 'omni', label: 'Veo 3.1 - Omni' },
]
export const modelLabel = (job) => {
  const v = job.kind === 'video' ? job.params?.quality : job.params?.model
  return [...IMAGE_MODELS, ...VIDEO_MODELS].find((m) => m.value === v)?.label || v || ''
}

export const STATUS_LABEL = {
  pending: 'Aguardando', processing: 'Gerando', downloading: 'Baixando', done: 'Pronto', failed: 'Erro', deleted: 'Na lixeira',
}

export const ERRO_LABEL = {
  sessao: 'Sessão do Google', quota: 'Sem cota/créditos', filtro: 'Recusado por política', cooldown: 'Pausa do Google', configuracao: 'Configuração', rede: 'Conexão', outro: 'Erro',
}

export function quando(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
