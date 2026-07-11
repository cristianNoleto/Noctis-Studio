// Provedores de IA — arquitetura agnóstica. Gemini (Google AI Studio) é o
// principal; Groq (Llama, free tier generoso) é alternativa gratuita.
// Em cota estourada (429) o Gemini tenta automaticamente modelos gratuitos
// mais leves antes de desistir; se houver chave Groq configurada, ela entra
// como último fallback.

export class AiError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

// Fallback estático (rede de segurança) caso o ListModels falhe. A descoberta
// dinâmica abaixo é a fonte principal — assim o sistema nunca fica preso a um
// modelo que o Google aposentou para contas novas.
const GEMINI_FALLBACKS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash',
]

// Cache curto dos modelos disponíveis por chave (evita um GET a cada geração).
const modelCache = new Map() // keyHash -> { ts, models: [names] }

// Descobre os modelos que a chave realmente pode usar para generateContent.
export async function availableGeminiModels(key) {
  const h = key.slice(-10)
  const hit = modelCache.get(h)
  if (hit && Date.now() - hit.ts < 30 * 60_000) return hit.models
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=100`)
    if (!res.ok) return []
    const data = await res.json()
    const models = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => (m.name || '').replace(/^models\//, ''))
      .filter((n) => /gemini/i.test(n) && !/(vision|embedding|aqa|image|tts|thinking|exp|preview)/i.test(n))
    modelCache.set(h, { ts: Date.now(), models })
    return models
  } catch {
    return []
  }
}

// Ordena do mais barato para o mais caro: flash-lite < flash < demais < pro.
function cheapestFirst(models) {
  const rank = (n) => {
    const s = n.toLowerCase()
    if (s.includes('flash-lite') || s.includes('lite')) return 0
    if (s.includes('flash')) return 1
    if (s.includes('pro')) return 3
    return 2
  }
  return [...models].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

export async function aiGenerateJson(req, { system, prompt }) {
  const provider = req.headers['x-ai-provider'] || 'gemini'
  const geminiKey = req.headers['x-gemini-key']
  const groqKey = req.headers['x-groq-key']

  if (provider === 'groq') {
    if (!groqKey) throw new AiError('missing_groq_key')
    return groqGenerate(groqKey, { system, prompt })
  }

  if (!geminiKey) {
    if (groqKey) return groqGenerate(groqKey, { system, prompt })
    throw new AiError('missing_gemini_key')
  }

  // 'auto' (ou vazio) = deixa o sistema escolher o modelo mais barato disponível.
  const requested = (req.headers['x-gemini-model'] || 'auto').trim()
  let chain = []
  const avail = await availableGeminiModels(geminiKey)
  if (avail.length) {
    const cheap = cheapestFirst(avail)
    chain = requested !== 'auto' && avail.includes(requested) ? [requested, ...cheap.filter((m) => m !== requested)] : cheap
  } else {
    // ListModels indisponível → usa o pedido (se houver) + a rede de segurança
    const preferred = requested !== 'auto' ? requested : GEMINI_FALLBACKS[0]
    chain = [preferred, ...GEMINI_FALLBACKS.filter((m) => m !== preferred)]
  }

  let lastErr = null
  for (const model of chain) {
    try {
      return await geminiGenerate(geminiKey, model, { system, prompt })
    } catch (err) {
      lastErr = err
      // 429 (cota) ou 404 (modelo indisponível) → tenta o próximo; outros erros param
      if (err.code !== 'ai_rate_limited') throw err
    }
  }
  // Todos os modelos Gemini estouraram — Groq como último recurso, se configurado
  if (groqKey) {
    try {
      return await groqGenerate(groqKey, { system, prompt })
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new AiError('ai_rate_limited')
}

async function geminiGenerate(key, model, { system, prompt }) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 400 || res.status === 403) throw new AiError('invalid_key', body?.error?.message)
    if (res.status === 429) throw new AiError('ai_rate_limited', `Cota do modelo ${model} atingida.`)
    if (res.status === 404) throw new AiError('ai_rate_limited', `Modelo ${model} indisponível.`) // deixa o fallback tentar o próximo
    throw new AiError('ai_error', body?.error?.message || `HTTP ${res.status}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return parseJson(text)
}

async function groqGenerate(key, { system, prompt }) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0.7,
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (res.status === 401) throw new AiError('invalid_key', 'Chave do Groq rejeitada.')
    if (res.status === 429) throw new AiError('ai_rate_limited', 'Cota do Groq atingida, aguarde um pouco.')
    throw new AiError('ai_error', body?.error?.message || `HTTP ${res.status}`)
  }

  const data = await res.json()
  return parseJson(data.choices?.[0]?.message?.content || '')
}

function parseJson(text) {
  try {
    return JSON.parse(text.replace(/^```json?\s*|```\s*$/g, ''))
  } catch {
    throw new AiError('ai_bad_response', 'A IA retornou um formato inesperado. Tente novamente.')
  }
}
