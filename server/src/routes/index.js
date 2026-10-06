import { Router } from 'express'
import youtubeRouter from './youtube.js'
import aiRouter from './ai.js'
import mediaRouter from './media.js'
import channelsRouter from './channels.js'
import skillsRouter from './skills.js'
import collaboratorsRouter from './collaborators.js'
import workspaceRouter from './workspace.js'
import excalidrawRouter from './excalidraw.js'
import templatesRouter from './templates.js'
import academyRouter from './academy.js'
import driveRouter from './drive.js'
import validationRouter from './validation.js'
import desktopRouter from './desktop.js'

const router = Router()

router.use('/youtube', youtubeRouter)
router.use('/ai', aiRouter)
router.use('/media', mediaRouter)
router.use('/channels', channelsRouter)
router.use('/skills', skillsRouter)
router.use('/collaborators', collaboratorsRouter)
router.use('/workspace', workspaceRouter)
router.use('/excalidraw', excalidrawRouter)
router.use('/excalidraw-templates', templatesRouter)
router.use('/academy', academyRouter)
router.use('/drive', driveRouter)
router.use('/validation', validationRouter)
router.use('/desktop', desktopRouter)
// Transcrição não passa mais por aqui: o navegador fala direto com a
// AssemblyAI (BYOK) — sem limite de upload em função serverless.

export default router
