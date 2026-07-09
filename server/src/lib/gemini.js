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

// Ordem de fallback dentro do free tier do Gemini (limites/dia distintos por modelo)
const GEMINI_FALLBACKS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']
const ALLOWED_MODELS = [...GEMINI_FALLBACKS, 'gemini-1.5-pro']

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

  const preferred = ALLOWED_MODELS.includes(req.headers['x-gemini-model']) ? req.headers['x-gemini-model'] : 'gemini-2.0-flash'
  const chain = [preferred, ...GEMINI_FALLBACKS.filter((m) => m !== preferred)]

  let lastErr = null
  for (const model of chain) {
    try {
      return await geminiGenerate(geminiKey, model, { system, prompt })
    } catch (err) {
      lastErr = err
      // 429 (cota do modelo) → tenta o próximo modelo gratuito; outros erros param aqui
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
