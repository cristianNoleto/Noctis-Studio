import { db } from './db'
import { supabase } from './supabase'

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

// Chamada de IA: envia as chaves BYOK (apiHeaders) E o token do Supabase quando
// houver — o servidor identifica o usuário pelo token para aplicar o limite
// diário de IA do plano (blindagem server-side). Sem token (modo local), o
// servidor não conta e libera.
async function aiRequest(path, { method = 'POST', body } = {}) {
  const headers = apiHeaders()
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new ApiError('server_offline', 'Servidor local não está rodando (npm run dev em server/).')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || 'request_failed', data.message)
  return data
}

// ---------------------------------------------------------------------------
// Transcrição — o navegador fala DIRETO com a AssemblyAI (sem passar pelo
// nosso backend): não há limite de upload de função serverless e funciona
// igual no modo local. A chave é do usuário (BYOK) e já vive no dispositivo.
// ---------------------------------------------------------------------------
const ASSEMBLY_BASE = 'https://api.assemblyai.com/v2'

function assemblyKey() {
  const key = db.getSetting('assemblyKey', '')
  if (!key) throw new ApiError('missing_assembly_key')
  return key
}

async function assemblyFetch(path, options = {}) {
  let res
  try {
    res = await fetch(`${ASSEMBLY_BASE}${path}`, {
      ...options,
      headers: { authorization: assemblyKey(), ...(options.headers || {}) },
    })
  } catch {
    throw new ApiError('assembly_unreachable')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) throw new ApiError('invalid_key')
    throw new ApiError('transcription_failed', data?.error)
  }
  return data
}

const assemblyStatusMap = (s) => ({ queued: 'preparing', processing: 'transcribing', completed: 'done', error: 'error' }[s] || s)

// ---------------------------------------------------------------------------
// Admin (/api/admin/*) — exige a sessão do Supabase: o token JWT vai no
// header e o servidor valida se o e-mail está na allowlist ADMIN_EMAILS.
// ---------------------------------------------------------------------------
async function adminRequest(path, { method = 'GET', body } = {}) {
  if (!supabase) throw new ApiError('local_mode', 'Gestão de usuários só existe com o Supabase configurado (produção).')
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new ApiError('unauthorized')
  let res
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('server_offline')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(json.error || 'request_failed', json.message)
  return json
}

// Requisição autenticada às rotas normais (/api/*) — manda o token JWT do
// Supabase; o servidor valida (ex.: escrita nas skills do sistema = fundador).
async function authRequest(path, { method = 'GET', body, keepalive = false } = {}) {
  if (!supabase) throw new ApiError('local_mode', 'Disponível apenas no site publicado (Supabase).')
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new ApiError('unauthorized')
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
      keepalive, // permite que a requisição sobreviva ao fechamento/refresh da página
    })
  } catch {
    throw new ApiError('server_offline')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(json.error || 'request_failed', json.message)
  return json
}

// Igual ao request público, mas anexa o token do Supabase quando disponível
// (o servidor usa para filtrar por visibilidade; sem token, cai no público).
async function authRequestOptional(path, { method = 'GET', body } = {}) {
  let token
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    token = data?.session?.access_token
  }
  let res
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('server_offline')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(json.error || 'request_failed', json.message)
  return json
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
    checkChannels: (ids) => request(`/youtube/check-channels?ids=${encodeURIComponent(ids.join(','))}`),
    keysStatus: () => request('/youtube/keys-status'),
    test: () => request('/youtube/test'),
  },
  ai: {
    // Com token (limite de plano server-side).
    seoReport: (payload) => aiRequest('/ai/seo-report', { body: payload }),
    nicheDoubling: (payload) => aiRequest('/ai/niche-doubling', { body: payload }),
    titles: (payload) => aiRequest('/ai/titles', { body: payload }),
    test: () => request('/ai/test', { method: 'POST', body: {} }),
    geminiModels: () => request('/ai/gemini-models'),
  },
  media: {
    search: (params) => request(`/media/search?${new URLSearchParams(params)}`),
    test: () => request('/media/test'),
  },
  channels: {
    // Base global de canais do Niche Finder (Supabase, compartilhada por todos)
    list: (params) => request(`/channels/list?${new URLSearchParams(params)}`),
    categories: () => request('/channels/categories'),
    stats: () => request('/channels/stats'),
    upsert: (channels) => request('/channels/upsert', { method: 'POST', body: { channels } }),
  },
  skills: {
    // Biblioteca de Skills do sistema — a listagem manda o token (quando houver)
    // para o servidor filtrar por visibilidade; escrita = fundador ou MASTER.
    list: () => authRequestOptional('/skills'),
    save: (skill) => authRequest('/skills/save', { method: 'POST', body: { skill } }),
    remove: (id) => authRequest(`/skills/${id}`, { method: 'DELETE' }),
    copied: (id) => request(`/skills/${id}/copied`, { method: 'POST', body: {} }),
  },
  collaborators: {
    list: () => authRequest('/collaborators'),
    save: (collaborator) => authRequest('/collaborators/save', { method: 'POST', body: { collaborator } }),
    remove: (id) => authRequest(`/collaborators/${id}`, { method: 'DELETE' }),
  },
  workspace: {
    // Migração/sync e leitura do snapshot; owner opcional (colaborador acessando
    // o workspace de outro dono, com permissão validada no servidor).
    migrate: (data, owner, keepalive = false) => authRequest(`/workspace/migrate${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`, { method: 'POST', body: { data }, keepalive }),
    snapshot: (owner) => authRequestOptional(`/workspace/snapshot${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`),
    workspaces: () => authRequest('/workspace/workspaces'),
    // Exclusão explícita e persistente de um item (o migrate é upsert-only).
    // O servidor valida a autoria (colaborador só apaga o que ele criou).
    remove: (collection, id, owner) => authRequest(`/workspace/delete${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`, { method: 'POST', body: { collection, id } }),
  },
  // Projetos do Excalidraw (quadro de desenho) — tabela dedicada, salvamento
  // próprio (separado do write-through do workspace).
  excalidraw: {
    // owner (e-mail) = workspace de outro usuário; ausente = próprio.
    list: (owner) => authRequest(`/excalidraw${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`),
    get: (id) => authRequest(`/excalidraw/${id}`),
    create: (body) => authRequest('/excalidraw', { method: 'POST', body }),
    save: (id, patch, keepalive = false) => authRequest(`/excalidraw/${id}`, { method: 'PUT', body: patch, keepalive }),
    remove: (id) => authRequest(`/excalidraw/${id}`, { method: 'DELETE' }),
    // Lixeira (backup de 7 dias): listar, restaurar e excluir de vez.
    trash: () => authRequest('/excalidraw/trash'),
    restore: (id) => authRequest(`/excalidraw/${id}/restore`, { method: 'POST' }),
    purge: (id) => authRequest(`/excalidraw/${id}/purge`, { method: 'DELETE' }),
  },
  // Biblioteca de modelos de desenho (fundador/Pro criam; todos usam conforme visibilidade).
  templates: {
    list: () => authRequestOptional('/excalidraw-templates'),
    get: (id) => authRequestOptional(`/excalidraw-templates/${id}`),
    save: (template) => authRequest('/excalidraw-templates', { method: 'POST', body: { template } }),
    used: (id) => authRequestOptional(`/excalidraw-templates/${id}/used`, { method: 'POST' }),
    remove: (id) => authRequest(`/excalidraw-templates/${id}`, { method: 'DELETE' }),
  },
  // Academia & Tutoriais — conteúdo global (fundador edita; todos leem).
  academy: {
    list: () => authRequestOptional('/academy'),
    save: (item) => authRequest('/academy', { method: 'POST', body: { item } }),
    remove: (id) => authRequest(`/academy/${id}`, { method: 'DELETE' }),
  },
  // Conexão do Google Drive (OAuth) por usuário.
  drive: {
    connect: () => authRequest('/drive/connect', { method: 'POST' }),
    status: () => authRequest('/drive/status'),
    // owner = porteiro: token do Drive do dono (colaborador autorizado).
    access: (owner) => authRequest(`/drive/access${owner ? `?owner=${encodeURIComponent(owner)}` : ''}`),
    disconnect: () => authRequest('/drive/disconnect', { method: 'DELETE' }),
  },
  transcription: {
    // Envia o arquivo de áudio direto para a AssemblyAI e abre o job.
    // language_detection: o idioma é detectado sozinho (pt, en, es...) — com
    // idioma fixo, um áudio em outra língua voltava vazio.
    async create(file) {
      const { upload_url: audioUrl } = await assemblyFetch('/upload', { method: 'POST', body: file })
      const data = await assemblyFetch('/transcript', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audio_url: audioUrl, language_detection: true }),
      })
      return { id: data.id, status: assemblyStatusMap(data.status) }
    },
    // Testa a chave da AssemblyAI direto do navegador (lista transcrições — valida o auth).
    async test() {
      try {
        await assemblyFetch('/transcript?limit=1')
        return { ok: true, message: 'Chave da AssemblyAI válida.' }
      } catch (err) {
        return { ok: false, code: err.code, message: err.code === 'invalid_key' ? 'Chave da AssemblyAI rejeitada.' : err.message || 'Falha ao validar.' }
      }
    },
    async status(id) {
      const data = await assemblyFetch(`/transcript/${id}`)
      const out = { id: data.id, status: assemblyStatusMap(data.status) }
      if (data.status === 'completed') {
        out.text = data.text
        // Palavras com tempo (ms) — os 3 formatos de SRT são gerados com isso
        out.words = (data.words || []).map((w) => ({ s: w.start, e: w.end, t: w.text }))
        // Blocos por tempo (~frases) para a UI de copiar/exportar
        out.blocks = (data.words || []).reduce((blocks, w) => {
          const last = blocks[blocks.length - 1]
          if (!last || w.start - last.end > 1200 || last.text.length > 220) {
            blocks.push({ start: w.start, end: w.end, text: w.text })
          } else {
            last.end = w.end
            last.text += ` ${w.text}`
          }
          return blocks
        }, [])
      }
      if (data.status === 'error') out.message = data.error
      return out
    },
  },
  admin: {
    listUsers: (page = 1) => adminRequest(`/users?page=${page}`),
    setPlan: (id, plan) => adminRequest(`/users/${id}`, { method: 'PATCH', body: { plan } }),
    setBan: (id, banned) => adminRequest(`/users/${id}/ban`, { method: 'POST', body: { banned } }),
    removeUser: (id) => adminRequest(`/users/${id}`, { method: 'DELETE' }),
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
    assembly_unreachable: 'Não foi possível falar com a AssemblyAI — confira sua conexão com a internet.',
    channel_not_found: 'Canal não encontrado no YouTube. Confira a URL ou o handle.',
    invalid_key: 'A chave de API informada foi rejeitada pelo provedor. Confira em Perfil → APIs.',
    ai_limit_reached: 'Você atingiu o limite diário de IA do seu plano. Faça upgrade em Meu Plano para liberar mais usos por dia.',
  }
  // Mensagens do servidor (ex.: limite com números) têm prioridade quando existem.
  if (err?.code === 'ai_limit_reached' && err?.message) return err.message
  return map[err?.code] || err?.message || 'Algo deu errado. Tente novamente.'
}
