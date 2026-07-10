import { Router } from 'express'
import multer from 'multer'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } })

const ASSEMBLY_BASE = 'https://api.assemblyai.com/v2'

// POST /api/transcribe — multipart (file) OU JSON { audioUrl }
router.post('/', upload.single('file'), async (req, res) => {
  const key = req.headers['x-assembly-key']
  if (!key) return res.status(400).json({ error: 'missing_assembly_key' })

  try {
    let audioUrl = req.body?.audioUrl
    if (req.file) {
      const up = await fetch(`${ASSEMBLY_BASE}/upload`, {
        method: 'POST',
        headers: { authorization: key },
        body: req.file.buffer,
      })
      if (!up.ok) {
        if (up.status === 401) return res.status(400).json({ error: 'invalid_key' })
        return res.status(502).json({ error: 'upload_failed' })
      }
      audioUrl = (await up.json()).upload_url
    }
    if (!audioUrl) return res.status(400).json({ error: 'missing_audio' })

    const tr = await fetch(`${ASSEMBLY_BASE}/transcript`, {
      method: 'POST',
      headers: { authorization: key, 'content-type': 'application/json' },
      body: JSON.stringify({ audio_url: audioUrl, language_code: req.body?.language || 'pt' }),
    })
    const data = await tr.json()
    if (!tr.ok) {
      if (tr.status === 401) return res.status(400).json({ error: 'invalid_key' })
      return res.status(502).json({ error: 'transcription_failed', message: data?.error })
    }
    res.json({ id: data.id, status: mapStatus(data.status) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error' })
  }
})

// GET /api/transcribe/:id/status
router.get('/:id/status', async (req, res) => {
  const key = req.headers['x-assembly-key']
  if (!key) return res.status(400).json({ error: 'missing_assembly_key' })

  try {
    const r = await fetch(`${ASSEMBLY_BASE}/transcript/${req.params.id}`, { headers: { authorization: key } })
    const data = await r.json()
    if (!r.ok) return res.status(502).json({ error: 'transcription_failed', message: data?.error })

    const out = { id: data.id, status: mapStatus(data.status) }
    if (data.status === 'completed') {
      out.text = data.text
      // Palavras com tempo (ms) — o client gera os 3 formatos de SRT com isso
      out.words = (data.words || []).map((w) => ({ s: w.start, e: w.end, t: w.text }))
      // Blocos por tempo (~frases) para a UI de copiar/exportar
      out.blocks = (data.words || []).reduce((blocks, w) => {
        const last = blocks[blocks.length - 1]
        if (!last || w.start - last.end > 1200 || last.text.length > 220) {
          blocks.push({ start: w.start, end: w.end, text: w.text })
        } else {
          last.end = w.end
          last.text += ` ${w.text}`
        }
        return blocks
      }, [])
    }
    if (data.status === 'error') out.message = data.error
    res.json(out)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'internal_error' })
  }
})

function mapStatus(s) {
  return { queued: 'preparing', processing: 'transcribing', completed: 'done', error: 'error' }[s] || s
}

export default router
