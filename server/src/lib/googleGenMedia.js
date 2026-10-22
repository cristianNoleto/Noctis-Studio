// ---------------------------------------------------------------------------
// Geração de IMAGEM e VÍDEO pela API OFICIAL do Google (Gemini API).
//   - Imagem: Gemini "flash image" (o mesmo modelo "Nano Banana" que o usuário já
//     conhece) via generateContent com responseModalities:["IMAGE"]. Também
//     aceita modelos Imagen (via :predict) se o admin configurar um.
//   - Vídeo: Veo via :predictLongRunning — é ASSÍNCRONO: submete, devolve o nome
//     da operação, faz-se poll até done e então baixa o mp4 (com a chave).
//
//   A chave é do DONO (uma só, central, cifrada no servidor). O navegador nunca
//   a recebe; só o servidor fala com o Google. Nada de login de conta Google,
//   nada de automação de navegador — o Google vende a geração pela API.
// ---------------------------------------------------------------------------

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

export class GenError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

async function readError(res, fallbackMsg) {
  let msg = fallbackMsg || `HTTP ${res.status}`
  try {
    const j = await res.json()
    msg = j?.error?.message || msg
  } catch {
    /* corpo não-JSON */
  }
  if (res.status === 400 && /api key|api_key|invalid/i.test(msg)) return new GenError('invalid_key', 'A chave do Google foi rejeitada. Confira a chave na Administração.')
  if (res.status === 403) return new GenError('invalid_key', 'A chave do Google não tem permissão (403). Verifique se a Gemini API está habilitada para ela.')
  if (res.status === 429) return new GenError('provider_rate_limited', 'Cota/limite do Google atingido no momento. Tente novamente em instantes.')
  if (res.status === 404) return new GenError('model_unavailable', `Modelo indisponível para esta chave. Ajuste o modelo na Administração. (${msg})`)
  return new GenError('provider_error', msg)
}

// Valida a chave listando modelos (não gera nada, não gasta cota de geração).
export async function ping(apiKey) {
  try {
    const res = await fetch(`${BASE}/models?pageSize=1&key=${encodeURIComponent(apiKey)}`)
    if (!res.ok) {
      const err = await readError(res)
      return { ok: false, code: err.code, message: err.message }
    }
    return { ok: true, message: 'Chave do Google (Gemini API) válida.' }
  } catch (e) {
    return { ok: false, code: 'unreachable', message: `Não foi possível falar com a API do Google: ${e.message}` }
  }
}

// Lista modelos da chave, separando os de imagem e os de vídeo (para o admin).
export async function listModels(apiKey) {
  const res = await fetch(`${BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`)
  if (!res.ok) throw await readError(res)
  const data = await res.json().catch(() => ({}))
  const names = (data.models || []).map((m) => (m.name || '').replace(/^models\//, '')).filter(Boolean)
  return {
    image: names.filter((n) => /imagen|flash-image|image/i.test(n) && !/veo/i.test(n)),
    video: names.filter((n) => /veo/i.test(n)),
    all: names,
  }
}

// ------------------------------- IMAGEM -------------------------------

// Gera uma imagem. Retorna { buffer, mimeType }. Suporta dois caminhos:
//   - Imagen (nome contém "imagen"): endpoint :predict
//   - Gemini flash-image (padrão "Nano Banana"): generateContent + IMAGE
export async function generateImage({ apiKey, model, prompt, aspectRatio = '16:9' }) {
  if (!prompt || !prompt.trim()) throw new GenError('empty_prompt', 'Escreva o prompt da imagem.')
  const m = model || 'gemini-2.5-flash-image'

  if (/imagen/i.test(m)) {
    const res = await fetch(`${BASE}/models/${encodeURIComponent(m)}:predict?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio } }),
    })
    if (!res.ok) throw await readError(res)
    const data = await res.json().catch(() => ({}))
    const pred = data.predictions?.[0]
    const b64 = pred?.bytesBase64Encoded || pred?.image?.bytesBase64Encoded
    if (!b64) throw new GenError('no_image', 'O modelo não retornou imagem (pode ter sido bloqueada por filtro de conteúdo).')
    return { buffer: Buffer.from(b64, 'base64'), mimeType: pred?.mimeType || 'image/png' }
  }

  // Gemini flash-image (generateContent)
  const res = await fetch(`${BASE}/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
    }),
  })
  if (!res.ok) throw await readError(res)
  const data = await res.json().catch(() => ({}))
  const block = data.promptFeedback?.blockReason
  if (block) throw new GenError('blocked', `A geração foi bloqueada por filtro de conteúdo (${block}). Ajuste o prompt.`)
  const parts = data.candidates?.[0]?.content?.parts || []
  const img = parts.find((p) => p.inlineData || p.inline_data)
  const inline = img?.inlineData || img?.inline_data
  if (!inline?.data) throw new GenError('no_image', 'O modelo não retornou imagem. Tente de novo ou ajuste o prompt.')
  return { buffer: Buffer.from(inline.data, 'base64'), mimeType: inline.mimeType || inline.mime_type || 'image/png' }
}

// ------------------------------- VÍDEO (Veo) -------------------------------

// Submete a geração de vídeo. Retorna o NOME da operação (poll depois).
export async function startVideo({ apiKey, model, prompt, aspectRatio = '16:9', negativePrompt }) {
  if (!prompt || !prompt.trim()) throw new GenError('empty_prompt', 'Escreva o prompt do vídeo.')
  const m = model || 'veo-3.1-generate-preview'
  const parameters = { aspectRatio, sampleCount: 1 }
  if (negativePrompt) parameters.negativePrompt = negativePrompt
  const res = await fetch(`${BASE}/models/${encodeURIComponent(m)}:predictLongRunning?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [{ prompt }], parameters }),
  })
  if (!res.ok) throw await readError(res)
  const data = await res.json().catch(() => ({}))
  if (!data.name) throw new GenError('provider_error', 'O Google não devolveu o identificador da operação de vídeo.')
  return data.name // ex.: "models/veo-.../operations/abc" ou "operations/abc"
}

// Consulta a operação. Retorna { done, uri, error }.
export async function pollVideo({ apiKey, operation }) {
  const op = String(operation).replace(/^\/+/, '')
  const res = await fetch(`${BASE}/${op}?key=${encodeURIComponent(apiKey)}`)
  if (!res.ok) throw await readError(res)
  const data = await res.json().catch(() => ({}))
  if (!data.done) return { done: false }
  if (data.error) return { done: true, error: data.error.message || 'Falha na geração do vídeo.' }
  // Caminho oficial atual: response.generateVideoResponse.generatedSamples[0].video.uri
  const r = data.response || {}
  const sample =
    r.generateVideoResponse?.generatedSamples?.[0] ||
    r.generatedSamples?.[0] ||
    r.predictions?.[0]
  const uri = sample?.video?.uri || sample?.video?.videoUri || sample?.videoUri || sample?.uri
  const raiReason = r.generateVideoResponse?.raiMediaFilteredReasons?.[0] || sample?.raiFilteredReason
  if (!uri) {
    if (raiReason) return { done: true, error: `Vídeo bloqueado por filtro de conteúdo: ${raiReason}` }
    return { done: true, error: 'O vídeo ficou pronto, mas sem URL de download.' }
  }
  return { done: true, uri }
}

// Baixa o mp4 da URI do Google (a URI exige a chave; segue redirects p/ storage).
export async function downloadVideo({ apiKey, uri }) {
  const sep = uri.includes('?') ? '&' : '?'
  const res = await fetch(`${uri}${sep}alt=media`, {
    headers: { 'x-goog-api-key': apiKey },
    redirect: 'follow',
  })
  if (!res.ok) throw await readError(res, 'Falha ao baixar o vídeo gerado.')
  const arrayBuf = await res.arrayBuffer()
  return { buffer: Buffer.from(arrayBuf), mimeType: res.headers.get('content-type') || 'video/mp4' }
}
