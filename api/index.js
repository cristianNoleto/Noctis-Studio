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

const app = express()

app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'noctis-studio-api', runtime: 'vercel', ts: new Date().toISOString() })
})

// Gestão de usuários (Supabase service role — só na Vercel)
app.use('/api/admin', adminRouter)

app.use('/api', apiRouter)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
})

export default app
