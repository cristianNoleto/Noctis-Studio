import { Router } from 'express'
import { requireAdmin } from '../lib/adminAuth.js'
import { getSecret, setSecret, deleteSecret, setAppState } from '../lib/platformSecrets.js'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { getGenMediaConfig, checkGenMediaLimit, recordGenMediaUse, countActiveVideoJobs, getDailyUsage } from '../lib/genMediaLimit.js'
import { founderEmails } from '../lib/adminAuth.js'
import { ping, listModels, generateImage, startVideo, pollVideo, downloadVideo, GenError } from '../lib/googleGenMedia.js'

// ---------------------------------------------------------------------------
// Geração de Imagem e Vídeo pela API OFICIAL do Google (Gemini API / Veo+Imagen).
//   A chave é do DONO (central, cifrada). Todo usuário com plano usa; o custo é
//   do dono → cota diária por usuário (imagem e vídeo separados). Sem login de
//   conta Google, sem automação de navegador — a API vende a geração.
//
//   Imagem é síncrona (volta o PNG). Vídeo (Veo) é assíncrono: cria um job,
//   o cliente consulta até "done" e então baixa o mp4.
//
//   Público (logado):
//     GET  /api/media-gen/status      → estado + cotas do dia
//     POST /api/media-gen/image       → gera imagem (conta 1) → PNG
//     POST /api/media-gen/video       → cria job de vídeo → { jobId, status }
//     GET  /api/media-gen/video/:id   → status do job (faz o poll no Google)
//     GET  /api/media-gen/video/:id/file → baixa o mp4 pronto
//     GET  /api/media-gen/videos      → últimos jobs de vídeo do usuário
//   Admin:
//     GET/PUT /api/media-gen/admin/config, POST /admin/test, GET /admin/models
// ---------------------------------------------------------------------------

const router = Router()
const SECRET_KEY = 'google_api_key'
const RANK = { FREE: 0, BASIC: 1, LITE: 2, PRO: 3, MASTER: 4 }

function handleErr(res, err) {
  if (err instanceof GenError) {
    const status =
      err.code === 'invalid_key' || err.code === 'model_unavailable' || err.code === 'provider_error' ? 502 :
      err.code === 'provider_rate_limited' ? 429 :
      err.code === 'empty_prompt' || err.code === 'blocked' ? 400 : 502
    return res.status(status).json({ error: err.code, message: err.message })
  }
  if (err?.code === 'enc_key_missing' || err?.code === 'not_configured') {
    return res.status(500).json({ error: 'not_configured', message: err.message })
  }
  console.error('[media-gen]', err)
  return res.status(500).json({ error: 'internal_error' })
}

const ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4']
function cleanAspect(a) {
  return ASPECTS.includes(a) ? a : '16:9'
}

// ------------------------------- Público -------------------------------

router.get('/status', async (req, res) => {
  try {
    const cfg = await getGenMediaConfig()
    const configured = !!(await getSecret(SECRET_KEY))
    const gate = await checkGenMediaLimit(req, cfg, 'image')
    const base = {
      enabled: cfg.enabled,
      configured,
      minPlan: cfg.minPlan,
      imageLimit: cfg.imageLimit,
      videoLimit: cfg.videoLimit,
      imageModel: cfg.imageModel,
      videoModel: cfg.videoModel,
    }
    if (gate.authRequired) return res.json({ ...base, authRequired: true, available: false })
    if (gate.banned) return res.json({ ...base, available: false, reason: 'banned' })
    if (gate.planBlocked) return res.json({ ...base, available: false, reason: 'plan', plan: gate.plan })
    const available = cfg.enabled && configured
    const usage = gate.user ? await getDailyUsage(gate.user.id) : { image_count: 0, video_count: 0 }
    return res.json({
      ...base,
      available,
      plan: gate.plan,
      unlimited: !!gate.unlimited,
      imageUsed: usage.image_count,
      videoUsed: usage.video_count,
      imageRemaining: gate.unlimited ? null : Math.max(0, cfg.imageLimit - usage.image_count),
      videoRemaining: gate.unlimited ? null : Math.max(0, cfg.videoLimit - usage.video_count),
    })
  } catch (err) {
    handleErr(res, err)
  }
})

// --- Imagem (síncrona) ---
router.post('/image', async (req, res) => {
  try {
    const cfg = await getGenMediaConfig()
    if (!cfg.enabled) return res.status(503).json({ error: 'disabled', message: 'A geração está desativada no momento.' })
    const gate = await checkGenMediaLimit(req, cfg, 'image')
    if (gate.authRequired) return res.status(401).json({ error: 'unauthorized', message: 'Faça login para gerar imagens.' })
    if (gate.banned) return res.status(403).json({ error: 'banned', message: 'Esta conta está suspensa.' })
    if (gate.planBlocked) return res.status(403).json({ error: 'plan_required', minPlan: gate.minPlan, message: `A geração exige o plano ${gate.minPlan} ou superior.` })
    if (gate.over) return res.status(429).json({ error: 'image_limit_reached', used: gate.used, limit: gate.limit, message: `Limite diário de imagens atingido (${gate.used}/${gate.limit}). Reseta amanhã.` })

    const apiKey = await getSecret(SECRET_KEY)
    if (!apiKey) return res.status(503).json({ error: 'not_configured', message: 'A geração ainda não foi ativada pelo administrador.' })

    const prompt = String(req.body?.prompt || '')
    if (!prompt.trim()) return res.status(400).json({ error: 'empty_prompt', message: 'Escreva o prompt da imagem.' })
    if (prompt.length > 5000) return res.status(400).json({ error: 'prompt_too_long', message: 'Prompt muito longo (máx. 5.000 caracteres).' })
    const aspectRatio = cleanAspect(req.body?.aspectRatio)

    const { buffer, mimeType } = await generateImage({ apiKey, model: cfg.imageModel, prompt: prompt.trim(), aspectRatio })

    let remaining = null
    if (gate.user && !gate.unlimited) {
      await recordGenMediaUse(gate.user, gate.day, 'image')
      remaining = Math.max(0, gate.limit - (gate.used + 1))
    }
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', 'inline; filename="imagem.png"')
    res.setHeader('Cache-Control', 'no-store')
    if (remaining !== null) res.setHeader('X-Image-Remaining', String(remaining))
    res.setHeader('X-Unlimited', gate.unlimited ? '1' : '0')
    res.send(buffer)
  } catch (err) {
    handleErr(res, err)
  }
})

// --- Vídeo (assíncrono): cria o job ---
router.post('/video', async (req, res) => {
  try {
    const cfg = await getGenMediaConfig()
    if (!cfg.enabled) return res.status(503).json({ error: 'disabled', message: 'A geração está desativada no momento.' })
    const gate = await checkGenMediaLimit(req, cfg, 'video')
    if (gate.authRequired) return res.status(401).json({ error: 'unauthorized', message: 'Faça login para gerar vídeos.' })
    if (gate.banned) return res.status(403).json({ error: 'banned', message: 'Esta conta está suspensa.' })
    if (gate.planBlocked) return res.status(403).json({ error: 'plan_required', minPlan: gate.minPlan, message: `A geração exige o plano ${gate.minPlan} ou superior.` })

    // Cota de vídeo considerando os que já estão em andamento (evita estourar o custo).
    const supa = supabaseAdmin()
    const active = gate.user ? await countActiveVideoJobs(gate.user.id) : 0
    if (!gate.unlimited) {
      if (gate.over || gate.used + active >= gate.limit) {
        return res.status(429).json({ error: 'video_limit_reached', used: gate.used, active, limit: gate.limit, message: `Limite diário de vídeos atingido (${gate.used + active}/${gate.limit}, contando os em andamento). Reseta amanhã.` })
      }
      if (active >= cfg.maxConcurrentVideos) {
        return res.status(429).json({ error: 'too_many_active', message: `Você já tem ${active} vídeo(s) em andamento. Aguarde terminar antes de gerar mais.` })
      }
    }

    const apiKey = await getSecret(SECRET_KEY)
    if (!apiKey) return res.status(503).json({ error: 'not_configured', message: 'A geração ainda não foi ativada pelo administrador.' })

    const prompt = String(req.body?.prompt || '')
    if (!prompt.trim()) return res.status(400).json({ error: 'empty_prompt', message: 'Escreva o prompt do vídeo.' })
    if (prompt.length > 5000) return res.status(400).json({ error: 'prompt_too_long', message: 'Prompt muito longo (máx. 5.000 caracteres).' })
    const aspectRatio = cleanAspect(req.body?.aspectRatio)
    const negativePrompt = req.body?.negativePrompt ? String(req.body.negativePrompt).slice(0, 1000) : undefined

    const operation = await startVideo({ apiKey, model: cfg.videoModel, prompt: prompt.trim(), aspectRatio, negativePrompt })

    if (!supa) return res.status(500).json({ error: 'not_configured', message: 'Supabase não configurado.' })
    const { data: job, error } = await supa
      .from('media_jobs')
      .insert({ user_id: gate.user.id, kind: 'video', status: 'processing', operation, prompt: prompt.trim(), params: { aspectRatio, model: cfg.videoModel } })
      .select('id, status, created_at')
      .single()
    if (error) return res.status(502).json({ error: 'job_create_failed', message: error.message })
    res.json({ jobId: job.id, status: job.status, createdAt: job.created_at })
  } catch (err) {
    handleErr(res, err)
  }
})

// Carrega um job do usuário (checa posse).
async function loadOwnedJob(req, res) {
  const supa = supabaseAdmin()
  if (!supa) { res.status(500).json({ error: 'not_configured' }); return null }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) { res.status(401).json({ error: 'unauthorized' }); return null }
  const { data: u } = await supa.auth.getUser(token)
  const user = u?.user
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return null }
  const { data: job } = await supa.from('media_jobs').select('*').eq('id', req.params.id).maybeSingle()
  if (!job || job.user_id !== user.id) { res.status(404).json({ error: 'not_found' }); return null }
  return { supa, user, job }
}

// --- Vídeo: status (faz o poll no Google e persiste a transição) ---
router.get('/video/:id', async (req, res) => {
  try {
    const ctx = await loadOwnedJob(req, res)
    if (!ctx) return
    const { supa, user, job } = ctx

    if (job.status === 'done' || job.status === 'failed') {
      return res.json({ jobId: job.id, status: job.status, error: job.error || undefined, ready: job.status === 'done', prompt: job.prompt })
    }

    const apiKey = await getSecret(SECRET_KEY)
    if (!apiKey) return res.status(503).json({ error: 'not_configured' })
    const result = await pollVideo({ apiKey, operation: job.operation })

    if (!result.done) {
      return res.json({ jobId: job.id, status: 'processing', ready: false, prompt: job.prompt })
    }
    if (result.error) {
      await supa.from('media_jobs').update({ status: 'failed', error: result.error, updated_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'processing')
      return res.json({ jobId: job.id, status: 'failed', ready: false, error: result.error, prompt: job.prompt })
    }

    // done com sucesso: persiste a URI e CONTA 1 vídeo — só na transição (guard por status).
    const { data: updated } = await supa
      .from('media_jobs')
      .update({ status: 'done', result_uri: result.uri, updated_at: new Date().toISOString() })
      .eq('id', job.id)
      .eq('status', 'processing')
      .select('id')
    // Conta 1 vídeo APENAS na transição processing→done (o guard .eq('status','processing')
    // garante uma única contagem). Fundador é ilimitado → não precisa contar.
    if (updated && updated.length) {
      const isFounder = founderEmails().includes((user.email || '').toLowerCase())
      if (!isFounder) await recordGenMediaUse(user, job.created_at?.slice(0, 10), 'video')
    }
    res.json({ jobId: job.id, status: 'done', ready: true, prompt: job.prompt })
  } catch (err) {
    handleErr(res, err)
  }
})

// --- Vídeo: baixa o mp4 pronto ---
router.get('/video/:id/file', async (req, res) => {
  try {
    const ctx = await loadOwnedJob(req, res)
    if (!ctx) return
    const { job } = ctx
    if (job.status !== 'done' || !job.result_uri) return res.status(409).json({ error: 'not_ready', message: 'O vídeo ainda não está pronto.' })
    const apiKey = await getSecret(SECRET_KEY)
    if (!apiKey) return res.status(503).json({ error: 'not_configured' })
    const { buffer, mimeType } = await downloadVideo({ apiKey, uri: job.result_uri })
    res.setHeader('Content-Type', mimeType || 'video/mp4')
    res.setHeader('Content-Disposition', `inline; filename="video-${job.id}.mp4"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(buffer)
  } catch (err) {
    handleErr(res, err)
  }
})

// --- Lista os últimos jobs de vídeo do usuário ---
router.get('/videos', async (req, res) => {
  try {
    const supa = supabaseAdmin()
    if (!supa) return res.json({ jobs: [] })
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'unauthorized' })
    const { data: u } = await supa.auth.getUser(token)
    if (!u?.user) return res.status(401).json({ error: 'unauthorized' })
    const { data } = await supa
      .from('media_jobs')
      .select('id, status, prompt, error, created_at')
      .eq('user_id', u.user.id)
      .eq('kind', 'video')
      .order('created_at', { ascending: false })
      .limit(30)
    res.json({ jobs: data || [] })
  } catch (err) {
    handleErr(res, err)
  }
})

// -------------------------------- Admin --------------------------------

router.get('/admin/config', async (req, res) => {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  try {
    const cfg = await getGenMediaConfig()
    const key = await getSecret(SECRET_KEY)
    res.json({ ...cfg, configured: !!key, keyHint: key ? `••••${key.slice(-4)}` : null })
  } catch (err) {
    handleErr(res, err)
  }
})

router.put('/admin/config', async (req, res) => {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  try {
    const body = req.body || {}
    const cfg = await getGenMediaConfig()
    const next = { ...cfg }
    const int = (v) => Math.floor(Number(v))

    if (typeof body.enabled === 'boolean') next.enabled = body.enabled
    for (const f of ['imageLimit', 'videoLimit', 'maxConcurrentVideos']) {
      if (body[f] !== undefined) {
        const n = int(body[f])
        if (!Number.isFinite(n) || n < 0 || n > 100000) return res.status(400).json({ error: 'invalid_value', message: `Valor inválido em ${f}.` })
        next[f] = f === 'maxConcurrentVideos' ? Math.max(1, n) : n
      }
    }
    if (body.minPlan !== undefined) {
      const p = String(body.minPlan).toUpperCase()
      if (RANK[p] === undefined) return res.status(400).json({ error: 'invalid_plan' })
      next.minPlan = p
    }
    if (body.imageModel !== undefined && body.imageModel) next.imageModel = String(body.imageModel).trim()
    if (body.videoModel !== undefined && body.videoModel) next.videoModel = String(body.videoModel).trim()

    if (body.clearKey === true) {
      await deleteSecret(SECRET_KEY)
    } else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
      const check = await ping(body.apiKey.trim())
      if (!check.ok) return res.status(400).json({ error: check.code || 'invalid_key', message: check.message })
      await setSecret(SECRET_KEY, body.apiKey.trim())
    }

    await setAppState('genmedia_config', {
      enabled: next.enabled,
      imageLimit: next.imageLimit,
      videoLimit: next.videoLimit,
      minPlan: next.minPlan,
      imageModel: next.imageModel,
      videoModel: next.videoModel,
      maxConcurrentVideos: next.maxConcurrentVideos,
    })
    const key = await getSecret(SECRET_KEY)
    res.json({ ok: true, ...next, configured: !!key, keyHint: key ? `••••${key.slice(-4)}` : null })
  } catch (err) {
    handleErr(res, err)
  }
})

router.post('/admin/test', async (req, res) => {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  try {
    const provided = typeof req.body?.apiKey === 'string' && req.body.apiKey.trim() ? req.body.apiKey.trim() : null
    const apiKey = provided || (await getSecret(SECRET_KEY))
    if (!apiKey) return res.json({ ok: false, message: 'Nenhuma chave do Google configurada.' })
    res.json(await ping(apiKey))
  } catch (err) {
    handleErr(res, err)
  }
})

router.get('/admin/models', async (req, res) => {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  try {
    const apiKey = await getSecret(SECRET_KEY)
    if (!apiKey) return res.json({ image: [], video: [], all: [] })
    res.json(await listModels(apiKey))
  } catch (err) {
    handleErr(res, err)
  }
})

export default router
