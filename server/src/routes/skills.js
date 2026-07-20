import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Biblioteca de Skills do sistema — catálogo global.
// Leitura: pública (qualquer usuário logado no site).
// Escrita: SOMENTE o fundador (FOUNDER_EMAIL), validado pelo token JWT.
const router = Router()

function requireSupabase(res) {
  const supa = supabaseAdmin()
  if (!supa) {
    res.status(400).json({ error: 'supabase_not_configured', message: 'Configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    return null
  }
  return supa
}

function founderEmails() {
  return (process.env.FOUNDER_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

async function requireFounder(req, res, supa) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) {
    res.status(401).json({ error: 'unauthorized', message: 'Faça login para gerenciar as skills.' })
    return false
  }
  const { data, error } = await supa.auth.getUser(token)
  const email = (data?.user?.email || '').toLowerCase()
  if (error || !email || !founderEmails().includes(email)) {
    res.status(403).json({ error: 'forbidden', message: 'Apenas o fundador pode gerenciar as skills do sistema.' })
    return false
  }
  return true
}

function toClient(r) {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    description: r.description || '',
    howToUse: r.how_to_use || '',
    content: r.content || '',
    videoUrl: r.video_url || '',
    imageUrl: r.image_url || '',
    copies: Number(r.copies) || 0,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
  }
}

// GET /skills — lista o catálogo inteiro
router.get('/', async (_req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { data, error } = await supa.from('system_skills').select('*').order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ skills: (data || []).map(toClient) })
})

// POST /skills/save — cria/atualiza (fundador)
router.post('/save', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  if (!(await requireFounder(req, res, supa))) return
  const s = req.body?.skill || {}
  if (!s.title?.trim() || !['generation', 'visual', 'camera'].includes(s.category)) {
    return res.status(400).json({ error: 'invalid_skill', message: 'Título e categoria são obrigatórios.' })
  }
  const row = {
    category: s.category,
    title: s.title.trim(),
    description: s.description || '',
    how_to_use: s.howToUse || '',
    content: s.content || '',
    video_url: s.videoUrl || '',
    image_url: s.imageUrl || '',
    updated_at: new Date().toISOString(),
  }
  const query = s.id
    ? supa.from('system_skills').update(row).eq('id', s.id).select().single()
    : supa.from('system_skills').insert(row).select().single()
  const { data, error } = await query
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ skill: toClient(data) })
})

// DELETE /skills/:id — exclui (fundador)
router.delete('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  if (!(await requireFounder(req, res, supa))) return
  const { error } = await supa.from('system_skills').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

// POST /skills/:id/copied — incrementa o contador de cópias (qualquer usuário)
router.post('/:id/copied', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { data } = await supa.from('system_skills').select('copies').eq('id', req.params.id).single()
  if (data) await supa.from('system_skills').update({ copies: (Number(data.copies) || 0) + 1 }).eq('id', req.params.id)
  res.json({ ok: true })
})

export default router
