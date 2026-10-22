import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import apiRouter from './routes/index.js'
import { securityHeaders, rateLimit } from './lib/security.js'
import { authEmailHook } from './routes/authEmailHook.js'

const app = express()
const port = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(securityHeaders)
app.post('/api/auth/email-hook', express.raw({ type: '*/*', limit: '1mb' }), authEmailHook)
app.use(express.json({ limit: '4mb' }))
app.use('/api/ai', rateLimit({ name: 'ai', windowMs: 60_000, max: 30 }))
app.use('/api/tts', rateLimit({ name: 'tts', windowMs: 60_000, max: 20 }))
app.use('/api/media-gen', rateLimit({ name: 'media-gen', windowMs: 60_000, max: 60 }))
app.use('/api', rateLimit({ name: 'global', windowMs: 60_000, max: 240 }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'noctis-studio-api', ts: new Date().toISOString() })
})

app.use('/api', apiRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
})

app.listen(port, () => {
  console.log(`Noctis Studio API rodando em http://localhost:${port}`)
})
