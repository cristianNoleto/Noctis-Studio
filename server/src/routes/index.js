import { Router } from 'express'
import youtubeRouter from './youtube.js'
import aiRouter from './ai.js'
import mediaRouter from './media.js'

const router = Router()

router.use('/youtube', youtubeRouter)
router.use('/ai', aiRouter)
router.use('/media', mediaRouter)
// Transcrição não passa mais por aqui: o navegador fala direto com a
// AssemblyAI (BYOK) — sem limite de upload em função serverless.

export default router
