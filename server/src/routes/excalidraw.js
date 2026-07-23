import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Projetos do Excalidraw (quadro de desenho). Cada cena é guardada numa tabela
// dedicada (excalidraw_scenes), com salvamento próprio — FORA do write-through
// do workspace, para as cenas grandes não pesarem no sync geral.
const router = Router()

function requireSupabase(res) {
  const supa = supabaseAdmin()
  if (!supa) {
    res.status(400).json({ error: 'supabase_not_configured', message: 'Configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    return null
  }
  return supa
}

async function getUser(req, supa) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await supa.auth.getUser(token)
  return data?.user || null
}

async function ensureProfile(supa, user) {
  await supa.from('profiles').upsert({ id: user.id, display_name: user.user_metadata?.name || user.email }, { onConflict: 'id' })
}

function toClient(row) {
  return { id: row.id, name: row.name, thumbnail: row.thumbnail || null, scene: row.scene || null, createdAt: row.created_at, updatedAt: row.updated_at }
}

// GET / — lista os projetos do usuário (SEM a cena, só metadados p/ a galeria)
router.get('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const { data = [], error } = await supa
    .from('excalidraw_scenes')
    .select('id, name, thumbnail, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ scenes: (data || []).map(toClient) })
})

// GET /:id — projeto completo (com a cena)
router.get('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const { data, error } = await supa.from('excalidraw_scenes').select('*').eq('id', req.params.id).eq('user_id', user.id).maybeSingle()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  if (!data) return res.status(404).json({ error: 'not_found' })
  res.json({ scene: toClient(data) })
})

// POST / — cria um projeto novo (vazio ou com cena inicial)
router.post('/', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  await ensureProfile(supa, user)
  const { name, scene } = req.body || {}
  const { data, error } = await supa
    .from('excalidraw_scenes')
    .insert({ user_id: user.id, name: (name || 'Sem título').slice(0, 120), scene: scene || {} })
    .select('*')
    .single()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ scene: toClient(data) })
})

// PUT /:id — salva alterações (nome, cena, miniatura). Autosave chama aqui.
router.put('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const patch = { updated_at: new Date().toISOString() }
  if (typeof req.body?.name === 'string') patch.name = req.body.name.slice(0, 120)
  if (req.body?.scene !== undefined) patch.scene = req.body.scene
  if (req.body?.thumbnail !== undefined) patch.thumbnail = req.body.thumbnail
  const { data, error } = await supa.from('excalidraw_scenes').update(patch).eq('id', req.params.id).eq('user_id', user.id).select('*').maybeSingle()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  if (!data) return res.status(404).json({ error: 'not_found' })
  res.json({ scene: toClient(data) })
})

// DELETE /:id
router.delete('/:id', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const { error } = await supa.from('excalidraw_scenes').delete().eq('id', req.params.id).eq('user_id', user.id)
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  res.json({ ok: true })
})

export default router
