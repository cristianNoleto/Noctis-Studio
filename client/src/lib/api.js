import { db } from './db'

// Cliente da API do backend. As chaves BYOK ficam salvas no dispositivo do
// usuário (settings) e são enviadas por header a cada chamada — o servidor
// nunca as persiste, apenas usa e aplica a rotação de cota do YouTube.

function apiHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  const ytKeys = (db.getSetting('ytKeys', []) || []).filter(Boolean)
  if (ytKeys.length) headers['x-yt-keys'] = JSON.stringify(ytKeys)
  const gemini = db.getSetting('geminiKey')
  if (gemini) headers['x-gemini-key'] = gemini
  headers['x-gemini-model'] = db.getSetting('geminiModel', 'gemini-2.0-flash')
  headers['x-ai-provider'] = db.getSetting('aiProvider', 'gemini')
  const groq = db.getSetting('groqKey')
  if (groq) headers['x-groq-key'] = groq
  const pexels = db.getSetting('pexelsKey')
  if (pexels) headers['x-pexels-key'] = pexels
  const pixabay = db.getSetting('pixabayKey')
  if (pixabay) headers['x-pixabay-key'] = pixabay
  const assembly = db.getSetting('assemblyKey')
  if (assembly) headers['x-assembly-key'] = assembly
  return headers
}

export class ApiError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

async function request(path, { method = 'GET', body, raw } = {}) {
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: raw ? undefined : apiHeaders(),
      body: raw ? body : body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('server_offline', 'Servidor local não está rodando (npm run dev em server/).')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || 'request_failed', data.message)
  return data
}

export const api = {
  youtube: {
    lookupChannel: (q) => request(`/youtube/channel?q=${encodeURIComponent(q)}`),
    channelStats: (id) => request(`/youtube/channel-stats?id=${encodeURIComponent(id)}`),
    searchChannels: (params) => request(`/youtube/search-channels?${new URLSearchParams(params)}`),
    viralVideos: (params) => request(`/youtube/viral?${new URLSearchParams(params)}`),
    topVideos: (channelId) => request(`/youtube/top-videos?id=${encodeURIComponent(channelId)}`),
    channelVideos: (channelId, pageToken = '') =>
      request(`/youtube/channel-videos?id=${encodeURIComponent(channelId)}&pageToken=${encodeURIComponent(pageToken)}`),
  },
  ai: {
    seoReport: (payload) => request('/ai/seo-report', { method: 'POST', body: payload }),
    nicheDoubling: (payload) => request('/ai/niche-doubling', { method: 'POST', body: payload }),
  },
  media: {
    search: (params) => request(`/media/search?${new URLSearchParams(params)}`),
  },
  transcription: {
    create: (formData) =>
      fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'x-assembly-key': db.getSetting('assemblyKey', '') },
        body: formData,
      }).then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new ApiError(d.error || 'request_failed', d.message)
        return d
      }),
    status: (id) => request(`/transcribe/${id}/status`),
  },
}

// Mensagens amigáveis para códigos de erro conhecidos do backend.
export function apiErrorMessage(err) {
  const map = {
    server_offline: 'O servidor local não está rodando. Abra um terminal e rode "npm run dev" na pasta server/.',
    missing_yt_keys: 'Nenhuma chave da YouTube API configurada. Adicione em Perfil → APIs.',
    all_keys_exhausted:
      'A cota diária de todas as chaves configuradas foi atingida. Tente novamente amanhã ou adicione mais uma chave em Perfil → APIs.',
    missing_gemini_key: 'Chave da API Gemini não configurada. Adicione em Perfil → APIs (aistudio.google.com/apikey).',
    missing_groq_key: 'Chave da API Groq não configurada. Adicione em Perfil → APIs (console.groq.com/keys).',
    ai_rate_limited:
      'Cota gratuita da IA atingida neste minuto/dia. O sistema já tentou os modelos alternativos — aguarde ~1 min, use o modelo gemini-2.0-flash, ou configure uma chave Groq (grátis) como reserva em Perfil → APIs.',
    missing_media_keys: 'Configure as chaves do Pexels e/ou Pixabay em Perfil → APIs.',
    missing_assembly_key: 'Configure a chave da API de transcrição (AssemblyAI) em Perfil → APIs.',
    channel_not_found: 'Canal não encontrado no YouTube. Confira a URL ou o handle.',
    invalid_key: 'A chave de API informada foi rejeitada pelo provedor. Confira em Perfil → APIs.',
  }
  return map[err?.code] || err?.message || 'Algo deu errado. Tente novamente.'
}
