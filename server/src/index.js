import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import apiRouter from './routes/index.js'

const app = express()
const port = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '4mb' }))

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
