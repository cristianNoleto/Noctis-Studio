// Provedor de IA — arquitetura agnóstica: para adicionar Anthropic/OpenAI
// depois, basta implementar outra função generate() com a mesma assinatura.

export class AiError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

const ALLOWED_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']

export async function geminiGenerateJson(req, { system, prompt }) {
  const key = req.headers['x-gemini-key']
  if (!key) throw new AiError('missing_gemini_key')
  const model = ALLOWED_MODELS.includes(req.headers['x-gemini-model']) ? req.headers['x-gemini-model'] : 'gemini-2.0-flash'

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
    if (res.status === 429) throw new AiError('ai_rate_limited', 'Cota da API Gemini atingida, aguarde um pouco.')
    throw new AiError('ai_error', body?.error?.message || `HTTP ${res.status}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  try {
    return JSON.parse(text.replace(/^```json?\s*|```\s*$/g, ''))
  } catch {
    throw new AiError('ai_bad_response', 'A IA retornou um formato inesperado. Tente novamente.')
  }
}
