import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Academia & Tutoriais — conteúdo GLOBAL (todos os usuários veem o mesmo).
//   Leitura: qualquer usuário logado.
//   Escrita: SOMENTE o fundador (FOUNDER_EMAIL), validado pelo token JWT.
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
  if (!token) { res.status(401).json({ error: 'unauthorized' }); return false }
  const { data } = await supa.auth.getUser(token)
  const email = (data?.user?.email || '').toLowerCase()
  if (!email || !founderEmails().includes(email)) {
    res.status(403).json({ error: 'forbidden', message: 'Apenas o fundador edita a Academia.' })
    return false
  }
  return true
}

function toClient(r) {
  return {
    id: r.id,
    section: r.section || 'page',
    pageKey: r.page_key || '',
    title: r.title || '',
    description: r.description || '',
    body: r.body || '',
    coverUrl: r.cover_url || '',
    embedUrl: r.video_embed_url || '',
    materials: Array.isArray(r.materials) ? r.materials : [],
    position: Number(r.position) || 0,
  }
}

function toRow(t) {
  return {
    section: ['setup', 'page'].includes(t.section) ? t.section : 'page',
    page_key: String(t.pageKey || '').slice(0, 60),
    title: String(t.title || '').slice(0, 160),
    description: String(t.description || '').slice(0, 400),
    body: String(t.body || '').slice(0, 8000),
    cover_url: typeof t.coverUrl === 'string' ? t.coverUrl : null,
    video_embed_url: String(t.embedUrl || '').slice(0, 500),
    materials: Array.isArray(t.materials)
      ? t.materials.filter((m) => m && m.url).map((m) => ({ label: String(m.label || '').slice(0, 120), url: String(m.url).slice(0, 500) })).slice(0, 10)
      : [],
    position: Number(t.position) || 0,
    updated_at: new Date().toISOString(),
  }
}

// GET /academy — lista todo o conteúdo (ordenado por seção e posição)
router.get('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const { data, error } = await supa.from('academy_content').select('*').order('position', { ascending: true })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ content: (data || []).map(toClient) })
})

// POST /academy — cria/atualiza um item (fundador)
router.post('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  if (!(await requireFounder(req, res, supa))) return
  const t = req.body?.item || {}
  if (!t.title?.trim()) return res.status(400).json({ error: 'invalid', message: 'Título é obrigatório.' })
  const row = toRow(t)
  const query = t.id
    ? supa.from('academy_content').update(row).eq('id', t.id).select('*').single()
    : supa.from('academy_content').insert(row).select('*').single()
  const { data, error } = await query
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ item: toClient(data) })
})

// DELETE /academy/:id — exclui (fundador)
router.delete('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  if (!(await requireFounder(req, res, supa))) return
  const { error } = await supa.from('academy_content').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

export default router
