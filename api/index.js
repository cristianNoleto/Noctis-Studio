// ---------------------------------------------------------------------------
// Função serverless da Vercel — envelopa o MESMO roteador Express usado no
// modo local (server/src/routes). O vercel.json reescreve todo /api/* para
// esta função (padrão oficial da Vercel para Express — o req.url original é
// preservado, então as rotas casam normalmente). Nada de servidor separado,
// nada de cold start de 40s.
//
// Observação: o cache em memória e o estado de "chave esgotada" vivem por
// instância aquecida — em cold start eles zeram, o que é aceitável (a rotação
// de chaves acontece dentro da própria requisição quando o YouTube devolve 403).
// ---------------------------------------------------------------------------
import express from 'express'
import apiRouter from '../server/src/routes/index.js'
import adminRouter from './_admin.js'
import { securityHeaders, rateLimit } from '../server/src/lib/security.js'
import { authEmailHook } from '../server/src/routes/authEmailHook.js'

const app = express()

app.use(securityHeaders)
// Send Email Hook do Supabase: precisa do corpo CRU p/ validar a assinatura,
// então vem ANTES do express.json (com seu próprio parser raw).
app.post('/api/auth/email-hook', express.raw({ type: '*/*', limit: '1mb' }), authEmailHook)
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'noctis-studio-api', runtime: 'vercel', ts: new Date().toISOString() })
})

// Limites mais apertados nos pontos sensíveis/caros (best-effort por instância).
app.use('/api/admin', rateLimit({ name: 'admin', windowMs: 60_000, max: 30 }))
app.use('/api/ai', rateLimit({ name: 'ai', windowMs: 60_000, max: 30 }))
// Narração (ElevenLabs): o teto real é a cota diária por usuário; este corte é
// só anti-rajada (geração é cara). Admin do TTS cai no limiter /api/admin acima? Não:
// as rotas de admin do TTS vivem em /api/tts/admin, então ficam neste limiter.
app.use('/api/tts', rateLimit({ name: 'tts', windowMs: 60_000, max: 20 }))
app.use('/api/channels/upsert', rateLimit({ name: 'upsert', windowMs: 60_000, max: 20 }))
app.use('/api/desktop/password', rateLimit({ name: 'desktop-password', windowMs: 15 * 60_000, max: 10 }))
app.use('/api/desktop', rateLimit({ name: 'desktop', windowMs: 60_000, max: 20 }))
// Teto geral de segurança para todo o resto.
app.use('/api', rateLimit({ name: 'global', windowMs: 60_000, max: 240 }))

// Gestão de usuários (Supabase service role — só na Vercel)
app.use('/api/admin', adminRouter)

app.use('/api', apiRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
})

export default app
