// ---------------------------------------------------------------------------
// Cliente do ElevenLabs (lado servidor). A chave é do DONO (uma só, central) —
// o navegador nunca a vê: só o servidor fala com o ElevenLabs. O áudio volta
// por /api/tts/generate como bytes (audio/mpeg).
// ---------------------------------------------------------------------------

import { Mp3Encoder } from '@breezystack/lamejs'

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

// Divide um texto com tags de personagem em TRECHOS por voz. Ex.:
//   "Oi. [João] Tudo bem? [Maria] Tudo!"  com default=V0, João=V1, Maria=V2
//   → [{voiceId:V0,text:"Oi."},{voiceId:V1,text:"Tudo bem?"},{voiceId:V2,text:"Tudo!"}]
// `speakers` = [{ tag, voiceId }]. Tags são comparadas sem diferenciar maiúsculas/
// acentos triviais. Uma tag desconhecida fica como texto comum (não quebra a voz).
// Retorna { segments, voices } onde voices = Set de voiceIds realmente usados.
export function parseSpeakerSegments(text, defaultVoiceId, speakers = []) {
  const norm = (s) => String(s || '').trim().toLowerCase()
  const map = new Map(speakers.filter((s) => s?.tag && s?.voiceId).map((s) => [norm(s.tag), s.voiceId]))
  const segments = []
  const voices = new Set()
  let currentVoice = defaultVoiceId
  let buffer = ''
  const flush = () => {
    const t = buffer.trim()
    if (t) { segments.push({ voiceId: currentVoice, text: t }); voices.add(currentVoice) }
    buffer = ''
  }
  // Varre marcadores [Nome]. Só troca a voz quando o nome está no mapa.
  const re = /\[([^\]\n]{1,60})\]/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    const name = norm(m[1])
    if (map.has(name)) {
      buffer += text.slice(last, m.index)
      flush()
      currentVoice = map.get(name)
      last = m.index + m[0].length
    }
    // tag desconhecida: deixa o texto como está (não mexe em last/buffer aqui)
  }
  buffer += text.slice(last)
  flush()
  return { segments, voices }
}

// Gera um trecho em PCM cru (s16le, mono). Usado para juntar vozes sem emenda:
// concatenar PCM é sample-accurate (sem o gap de ~26 ms que o MP3 cria a cada
// trecho). Depois o conjunto é reencodado num ÚNICO mp3. Nem toda conta do
// ElevenLabs libera PCM (tiers): o chamador faz fallback para mp3 se falhar.
export async function generatePcm({ apiKey, text, voiceId, modelId, voiceSettings, sampleRate = 44100 }) {
  if (!text || !text.trim()) throw new TtsError('empty_text', 'Trecho vazio.')
  const body = { text, model_id: modelId || 'eleven_multilingual_v2' }
  if (voiceSettings && typeof voiceSettings === 'object') body.voice_settings = voiceSettings
  const res = await fetch(`${BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_${sampleRate}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw await readError(res)
  return { buffer: Buffer.from(await res.arrayBuffer()), sampleRate }
}

// Reencoda PCM cru (s16le mono) num único mp3 (128 kbps) com o lamejs.
export function encodePcmToMp3(pcm, sampleRate = 44100, kbps = 128) {
  // Int16 alinhado: copia os bytes para um ArrayBuffer próprio (offset 0, par).
  const n = Math.floor(pcm.byteLength / 2)
  const ab = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + n * 2)
  const samples = new Int16Array(ab)
  const enc = new Mp3Encoder(1, sampleRate, kbps)
  const out = []
  const BLOCK = 1152
  for (let i = 0; i < samples.length; i += BLOCK) {
    const chunk = samples.subarray(i, i + BLOCK)
    const mp3 = enc.encodeBuffer(chunk)
    if (mp3.length) out.push(Buffer.from(mp3))
  }
  const end = enc.flush()
  if (end.length) out.push(Buffer.from(end))
  return Buffer.concat(out)
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
