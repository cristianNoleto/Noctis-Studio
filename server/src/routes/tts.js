import { Router } from 'express'
import { requireAdmin } from '../lib/adminAuth.js'
import { getSecret, setSecret, deleteSecret, setAppState } from '../lib/platformSecrets.js'
import { getTtsConfig, checkTtsLimit, recordTtsUse } from '../lib/ttsLimit.js'
import { ping, listVoices, listModels, generate, TtsError } from '../lib/elevenlabs.js'

// ---------------------------------------------------------------------------
// Narração (Text-to-Speech via ElevenLabs).
//   A chave do ElevenLabs é do DONO (uma só, central) — configurada pelo admin
//   no site e guardada CIFRADA. Todo usuário com plano usa essa chave; o custo é
//   do dono. Por isso há cota diária por usuário (padrão 30 áudios/dia), travada
//   no servidor. 1 geração bem-sucedida = 1 áudio.
//
//   Público (usuário logado):
//     GET  /api/tts/status    → estado (ligado, configurado, cota do dia, plano)
//     GET  /api/tts/voices    → vozes da conta do dono
//     POST /api/tts/generate  → gera o áudio (conta 1 na cota) e devolve o mp3
//   Admin (fundador/ADMIN_EMAILS):
//     GET  /api/tts/admin/config → config atual (+ se a chave está configurada)
//     PUT  /api/tts/admin/config → salva chave/liga-desliga/limite/plano/modelo
//     POST /api/tts/admin/test   → valida a chave (atual ou enviada)
//     GET  /api/tts/admin/models → modelos disponíveis para a chave do dono
// ---------------------------------------------------------------------------

const router = Router()
const SECRET_KEY = 'elevenlabs_api_key'
const RANK = { FREE: 0, BASIC: 1, LITE: 2, PRO: 3, MASTER: 4 }

// Cache em memória das vozes (por instância aquecida) para não bater no
// ElevenLabs a cada abertura da tela. Invalidado quando o admin troca a chave.
let voiceCache = { at: 0, voices: null }
const VOICE_TTL = 10 * 60_000
function clearVoiceCache() {
  voiceCache = { at: 0, voices: null }
}

function handleTtsError(res, err) {
  if (err instanceof TtsError) {
    const status = err.code === 'invalid_key' ? 502 : err.code === 'provider_rate_limited' ? 429 : err.code === 'empty_text' || err.code === 'no_voice' || err.code === 'invalid_request' ? 400 : 502
    return res.status(status).json({ error: err.code, message: err.message })
  }
  if (err?.code === 'enc_key_missing' || err?.code === 'not_configured') {
    return res.status(500).json({ error: 'not_configured', message: err.message })
  }
  console.error('[tts]', err)
  return res.status(500).json({ error: 'internal_error' })
}

// ------------------------------- Público -------------------------------

// Estado para a tela de Narração: liga/desliga, se a chave existe, e a cota do dia.
router.get('/status', async (req, res) => {
  try {
    const cfg = await getTtsConfig()
    const configured = !!(await getSecret(SECRET_KEY))
    const gate = await checkTtsLimit(req, cfg)
    const base = {
      enabled: cfg.enabled,
      configured,
      minPlan: cfg.minPlan,
      dailyLimit: cfg.dailyLimit,
      modelId: cfg.modelId,
    }
    if (gate.authRequired) return res.json({ ...base, authRequired: true, available: false })
    if (gate.banned) return res.json({ ...base, available: false, reason: 'banned' })
    if (gate.planBlocked) return res.json({ ...base, available: false, reason: 'plan', plan: gate.plan })
    const available = cfg.enabled && configured
    return res.json({
      ...base,
      available,
      plan: gate.plan,
      unlimited: !!gate.unlimited,
      used: gate.over ? gate.used : gate.used || 0,
      remaining: gate.unlimited ? null : gate.over ? 0 : gate.remaining,
      over: !!gate.over,
    })
  } catch (err) {
    handleTtsError(res, err)
  }
})

router.get('/voices', async (req, res) => {
  try {
    const cfg = await getTtsConfig()
    const gate = await checkTtsLimit(req, cfg)
    if (gate.authRequired) return res.status(401).json({ error: 'unauthorized', message: 'Faça login para usar a narração.' })
    if (gate.planBlocked) return res.status(403).json({ error: 'plan_required', minPlan: gate.minPlan, message: `A Narração exige o plano ${gate.minPlan} ou superior.` })
    const apiKey = await getSecret(SECRET_KEY)
    if (!apiKey) return res.status(503).json({ error: 'not_configured', message: 'A Narração ainda não foi ativada pelo administrador.' })
    const now = Date.now()
    if (voiceCache.voices && now - voiceCache.at < VOICE_TTL) return res.json({ voices: voiceCache.voices, cached: true })
    const voices = await listVoices(apiKey)
    voiceCache = { at: now, voices }
    res.json({ voices })
  } catch (err) {
    handleTtsError(res, err)
  }
})

router.post('/generate', async (req, res) => {
  try {
    const cfg = await getTtsConfig()
    if (!cfg.enabled) return res.status(503).json({ error: 'disabled', message: 'A Narração está desativada no momento.' })

    const gate = await checkTtsLimit(req, cfg)
    if (gate.authRequired) return res.status(401).json({ error: 'unauthorized', message: 'Faça login para usar a narração.' })
    if (gate.banned) return res.status(403).json({ error: 'banned', message: 'Esta conta está suspensa.' })
    if (gate.planBlocked) return res.status(403).json({ error: 'plan_required', minPlan: gate.minPlan, plan: gate.plan, message: `A Narração exige o plano ${gate.minPlan} ou superior.` })
    if (gate.over) {
      return res.status(429).json({
        error: 'tts_limit_reached',
        used: gate.used,
        limit: gate.limit,
        message: `Você atingiu o limite diário de narração (${gate.used}/${gate.limit} áudios hoje). O limite reseta amanhã.`,
      })
    }

    const apiKey = await getSecret(SECRET_KEY)
    if (!apiKey) return res.status(503).json({ error: 'not_configured', message: 'A Narração ainda não foi ativada pelo administrador.' })

    const text = String(req.body?.text || '')
    const voiceId = String(req.body?.voiceId || '')
    const modelId = req.body?.modelId ? String(req.body.modelId) : cfg.modelId
    if (!text.trim()) return res.status(400).json({ error: 'empty_text', message: 'Escreva o texto da narração.' })
    if (text.length > 5000) return res.status(400).json({ error: 'text_too_long', message: 'O texto é muito longo (máximo 5.000 caracteres por áudio).' })
    if (!voiceId) return res.status(400).json({ error: 'no_voice', message: 'Escolha uma voz.' })

    // voice_settings opcionais (0–1). Ignora valores fora da faixa.
    let voiceSettings
    const vs = req.body?.voiceSettings
    if (vs && typeof vs === 'object') {
      const clamp = (n) => (Number.isFinite(Number(n)) ? Math.min(1, Math.max(0, Number(n))) : undefined)
      voiceSettings = {}
      if (clamp(vs.stability) !== undefined) voiceSettings.stability = clamp(vs.stability)
      if (clamp(vs.similarity_boost ?? vs.similarityBoost) !== undefined) voiceSettings.similarity_boost = clamp(vs.similarity_boost ?? vs.similarityBoost)
      if (clamp(vs.style) !== undefined) voiceSettings.style = clamp(vs.style)
      if (typeof vs.use_speaker_boost === 'boolean') voiceSettings.use_speaker_boost = vs.use_speaker_boost
      if (!Object.keys(voiceSettings).length) voiceSettings = undefined
    }

    const { buffer, contentType } = await generate({ apiKey, text, voiceId, modelId, voiceSettings })

    // Só conta DEPOIS de gerar com sucesso (gate.user existe quando há Supabase).
    let remaining = null
    if (gate.user && !gate.unlimited) {
      await recordTtsUse(gate.user, gate.day)
      remaining = Math.max(0, gate.limit - (gate.used + 1))
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', 'inline; filename="narracao.mp3"')
    res.setHeader('Cache-Control', 'no-store')
    if (remaining !== null) res.setHeader('X-Tts-Remaining', String(remaining))
    res.setHeader('X-Tts-Unlimited', gate.unlimited ? '1' : '0')
    res.send(buffer)
  } catch (err) {
    handleTtsError(res, err)
  }
})

// -------------------------------- Admin --------------------------------

router.get('/admin/config', async (req, res) => {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  try {
    const cfg = await getTtsConfig()
    const key = await getSecret(SECRET_KEY)
    res.json({
      enabled: cfg.enabled,
      configured: !!key,
      dailyLimit: cfg.dailyLimit,
      minPlan: cfg.minPlan,
      modelId: cfg.modelId,
      keyHint: key ? `••••${key.slice(-4)}` : null,
    })
  } catch (err) {
    handleTtsError(res, err)
  }
})

router.put('/admin/config', async (req, res) => {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  try {
    const body = req.body || {}
    const cfg = await getTtsConfig()
    const next = { ...cfg }

    if (typeof body.enabled === 'boolean') next.enabled = body.enabled
    if (body.dailyLimit !== undefined) {
      const n = Math.floor(Number(body.dailyLimit))
      if (!Number.isFinite(n) || n < 0 || n > 100000) return res.status(400).json({ error: 'invalid_limit', message: 'Limite diário inválido.' })
      next.dailyLimit = n
    }
    if (body.minPlan !== undefined) {
      const p = String(body.minPlan).toUpperCase()
      if (RANK[p] === undefined) return res.status(400).json({ error: 'invalid_plan', message: 'Plano mínimo inválido.' })
      next.minPlan = p
    }
    if (body.modelId !== undefined && body.modelId) next.modelId = String(body.modelId)

    // Chave: string não-vazia = salvar (valida antes); clearKey:true = remover;
    // string vazia/ausente = não mexe na chave.
    if (body.clearKey === true) {
      await deleteSecret(SECRET_KEY)
      clearVoiceCache()
    } else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
      const check = await ping(body.apiKey.trim())
      if (!check.ok) return res.status(400).json({ error: check.code || 'invalid_key', message: check.message })
      await setSecret(SECRET_KEY, body.apiKey.trim())
      clearVoiceCache()
    }

    await setAppState('tts_config', { enabled: next.enabled, dailyLimit: next.dailyLimit, minPlan: next.minPlan, modelId: next.modelId })
    const key = await getSecret(SECRET_KEY)
    res.json({
      ok: true,
      enabled: next.enabled,
      configured: !!key,
      dailyLimit: next.dailyLimit,
      minPlan: next.minPlan,
      modelId: next.modelId,
      keyHint: key ? `••••${key.slice(-4)}` : null,
    })
  } catch (err) {
    handleTtsError(res, err)
  }
})

router.post('/admin/test', async (req, res) => {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  try {
    const provided = typeof req.body?.apiKey === 'string' && req.body.apiKey.trim() ? req.body.apiKey.trim() : null
    const apiKey = provided || (await getSecret(SECRET_KEY))
    if (!apiKey) return res.json({ ok: false, message: 'Nenhuma chave do ElevenLabs configurada.' })
    const result = await ping(apiKey)
    res.json(result)
  } catch (err) {
    handleTtsError(res, err)
  }
})

router.get('/admin/models', async (req, res) => {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  try {
    const apiKey = await getSecret(SECRET_KEY)
    if (!apiKey) return res.json({ models: [] })
    res.json({ models: await listModels(apiKey) })
  } catch (err) {
    handleTtsError(res, err)
  }
})

export default router
