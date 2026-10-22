import { call } from './api'

// Converte o base64 que vem da ponte IPC num Blob para tocar/baixar no renderer.
function base64ToBlob(base64, mime) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

// Narração (TTS) e Estúdio (imagem/vídeo) via API hospedada (IPC → main → site).
// `call` já desembrulha { ok, data } e joga erro com .code/.message quando falha.
export const studio = {
  // Narração
  ttsStatus: () => call('studio:tts-status'),
  ttsVoices: () => call('studio:tts-voices'),
  async ttsGenerate(body) {
    const r = await call('studio:tts-generate', body)
    return { blob: base64ToBlob(r.base64, r.mime), cost: r.cost, remaining: r.remaining, unlimited: r.unlimited }
  },
  // Estúdio
  mediaStatus: () => call('studio:media-status'),
  async image(body) {
    const r = await call('studio:image', body)
    return { blob: base64ToBlob(r.base64, r.mime), remaining: r.remaining, unlimited: r.unlimited }
  },
  videoStart: (body) => call('studio:video-start', body),
  videoStatus: (id) => call('studio:video-status', id),
  async videoFile(id) {
    const r = await call('studio:video-file', id)
    return base64ToBlob(r.base64, r.mime)
  },
  videos: () => call('studio:videos'),
}
