// ---------------------------------------------------------------------------
// Cliente do ElevenLabs (lado servidor). A chave é do DONO (uma só, central) —
// o navegador nunca a vê: só o servidor fala com o ElevenLabs. O áudio volta
// por /api/tts/generate como bytes (audio/mpeg).
// ---------------------------------------------------------------------------

const BASE = 'https://api.elevenlabs.io/v1'

export class TtsError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

// Traduz um erro do ElevenLabs numa mensagem/código amigável.
async function readError(res) {
  let detail = ''
  try {
    const j = await res.json()
    detail = j?.detail?.message || j?.detail || j?.message || ''
    if (typeof detail === 'object') detail = JSON.stringify(detail)
  } catch {
    /* corpo não-JSON */
  }
  if (res.status === 401) return new TtsError('invalid_key', 'A chave do ElevenLabs foi rejeitada. Confira a chave na Administração.')
  if (res.status === 429) return new TtsError('provider_rate_limited', 'O ElevenLabs está limitando as requisições no momento. Tente de novo em instantes.')
  if (res.status === 422) return new TtsError('invalid_request', detail || 'Requisição inválida (voz ou modelo incompatível).')
  return new TtsError('provider_error', detail || `ElevenLabs respondeu ${res.status}.`)
}

// Valida a chave e devolve dados básicos da assinatura (usado no teste do admin).
export async function ping(apiKey) {
  try {
    const res = await fetch(`${BASE}/user/subscription`, { headers: { 'xi-api-key': apiKey } })
    if (!res.ok) {
      const err = await readError(res)
      return { ok: false, code: err.code, message: err.message }
    }
    const sub = await res.json().catch(() => ({}))
    const used = sub.character_count
    const limit = sub.character_limit
    const tier = sub.tier || sub.subscription?.tier
    const extra = Number.isFinite(used) && Number.isFinite(limit) ? ` — ${used.toLocaleString('pt-BR')}/${limit.toLocaleString('pt-BR')} caracteres usados${tier ? ` (plano ${tier})` : ''}` : ''
    return { ok: true, message: `Chave do ElevenLabs válida${extra}.`, tier, used, limit }
  } catch (e) {
    return { ok: false, code: 'unreachable', message: `Não foi possível falar com o ElevenLabs: ${e.message}` }
  }
}

// Catálogo de vozes da conta do dono.
export async function listVoices(apiKey) {
  const res = await fetch(`${BASE}/voices`, { headers: { 'xi-api-key': apiKey } })
  if (!res.ok) throw await readError(res)
  const data = await res.json().catch(() => ({}))
  return (data.voices || []).map((v) => ({
    voiceId: v.voice_id,
    name: v.name,
    category: v.category || null,
    previewUrl: v.preview_url || null,
    labels: v.labels || {},
    description: v.description || '',
  }))
}

// Modelos de TTS disponíveis (para o seletor do admin).
export async function listModels(apiKey) {
  const res = await fetch(`${BASE}/models`, { headers: { 'xi-api-key': apiKey } })
  if (!res.ok) throw await readError(res)
  const data = await res.json().catch(() => [])
  return (Array.isArray(data) ? data : [])
    .filter((m) => m.can_do_text_to_speech !== false)
    .map((m) => ({ modelId: m.model_id, name: m.name || m.model_id, languages: (m.languages || []).map((l) => l.language_id) }))
}

// Gera o áudio. Retorna { buffer, contentType, characters }.
export async function generate({ apiKey, text, voiceId, modelId, voiceSettings, outputFormat = 'mp3_44100_128' }) {
  if (!text || !text.trim()) throw new TtsError('empty_text', 'Escreva o texto da narração.')
  if (!voiceId) throw new TtsError('no_voice', 'Escolha uma voz.')
  const body = {
    text,
    model_id: modelId || 'eleven_multilingual_v2',
  }
  if (voiceSettings && typeof voiceSettings === 'object') body.voice_settings = voiceSettings
  const res = await fetch(`${BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await readError(res)
  const arrayBuf = await res.arrayBuffer()
  return { buffer: Buffer.from(arrayBuf), contentType: 'audio/mpeg', characters: text.length }
}
