import { Router } from 'express'
import youtubeRouter from './youtube.js'
import aiRouter from './ai.js'
import mediaRouter from './media.js'
import channelsRouter from './channels.js'
import skillsRouter from './skills.js'
import collaboratorsRouter from './collaborators.js'
import workspaceRouter from './workspace.js'

const router = Router()

router.use('/youtube', youtubeRouter)
router.use('/ai', aiRouter)
router.use('/media', mediaRouter)
router.use('/channels', channelsRouter)
router.use('/skills', skillsRouter)
router.use('/collaborators', collaboratorsRouter)
router.use('/workspace', workspaceRouter)
// Transcrição não passa mais por aqui: o navegador fala direto com a
// AssemblyAI (BYOK) — sem limite de upload em função serverless.

export default router
