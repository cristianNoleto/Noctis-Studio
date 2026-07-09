import { Router } from 'express'
import youtubeRouter from './youtube.js'
import aiRouter from './ai.js'
import mediaRouter from './media.js'
import transcribeRouter from './transcribe.js'

const router = Router()

router.use('/youtube', youtubeRouter)
router.use('/ai', aiRouter)
router.use('/media', mediaRouter)
router.use('/transcribe', transcribeRouter)

export default router
