// ---------------------------------------------------------------------------
// /api/admin/* — gestão de usuários do Supabase SEM entrar no painel deles.
// Segurança em duas camadas:
//   1. O chamador precisa estar logado (token JWT do Supabase no header
//      Authorization) — o token é validado no servidor.
//   2. O e-mail do chamador precisa estar na env ADMIN_EMAILS (lista separada
//      por vírgula, configurada na Vercel).
// A SUPABASE_SERVICE_ROLE_KEY NUNCA vai ao navegador — vive só nesta função.
// (O prefixo _ faz a Vercel não expor este arquivo como função própria.)
// ---------------------------------------------------------------------------
import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

function parseEmails(v) {
  return (v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function getConfig() {
  const founders = parseEmails(process.env.FOUNDER_EMAIL)
  // O fundador é sempre admin, mesmo que não esteja em ADMIN_EMAILS.
  const admins = [...new Set([...parseEmails(process.env.ADMIN_EMAILS), ...founders])]
  return {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    admins,
    founders,
  }
}

// Bloqueia qualquer ação sobre a conta do fundador (plano, ban, exclusão).
// Busca o alvo pelo id e compara o e-mail com a allowlist FOUNDER_EMAIL.
async function blockIfFounder(req, res) {
  const founders = getConfig().founders
  if (!founders.length) return false
  const { data } = await req.supa.auth.admin.getUserById(req.params.id)
  const email = (data?.user?.email || '').toLowerCase()
  if (email && founders.includes(email)) {
    res.status(403).json({ error: 'cannot_modify_founder', message: 'A conta do fundador é blindada e não pode ser alterada.' })
    return true
  }
  return false
}

// Toda rota daqui exige token válido + e-mail na allowlist
router.use(async (req, res, next) => {
  const { url, serviceKey, admins } = getConfig()
  if (!url || !serviceKey || !admins.length) {
    return res.status(500).json({
      error: 'admin_not_configured',
      message: 'Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e ADMIN_EMAILS nas variáveis de ambiente da Vercel.',
    })
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'unauthorized' })

  const supa = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supa.auth.getUser(token)
  if (error || !data?.user) return res.status(401).json({ error: 'unauthorized' })
  if (!admins.includes((data.user.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'forbidden', message: 'Este e-mail não está em ADMIN_EMAILS.' })
  }
  req.supa = supa
  req.adminUser = data.user
  next()
})

function toUserJson(u) {
  const founder = getConfig().founders.includes((u.email || '').toLowerCase())
  return {
    id: u.id,
    email: u.email,
    name: u.user_metadata?.display_name || null,
    founder,
    plan: founder ? 'MASTER' : u.app_metadata?.plan || 'FREE',
    providers: [...new Set((u.identities || []).map((i) => i.provider))],
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at || null,
    banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
  }
}

// GET /api/admin/users?page=1 — lista paginada (50 por página)
router.get('/users', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const { data, error } = await req.supa.auth.admin.listUsers({ page, perPage: 50 })
  if (error) return res.status(502).json({ error: 'admin_failed', message: error.message })
  res.json({ users: (data.users || []).map(toUserJson), page, total: data.total ?? null })
})

// PATCH /api/admin/users/:id { plan } — muda o plano da conta
router.patch('/users/:id', async (req, res) => {
  const plan = String(req.body?.plan || '').toUpperCase()
  if (!['FREE', 'BASIC', 'LITE', 'PRO', 'MASTER'].includes(plan)) {
    return res.status(400).json({ error: 'invalid_plan' })
  }
  if (await blockIfFounder(req, res)) return
  const { data, error } = await req.supa.auth.admin.updateUserById(req.params.id, { app_metadata: { plan } })
  if (error) return res.status(502).json({ error: 'admin_failed', message: error.message })
  res.json({ user: toUserJson(data.user) })
})

// POST /api/admin/users/:id/ban { banned: true|false } — suspende/reativa
router.post('/users/:id/ban', async (req, res) => {
  if (req.params.id === req.adminUser.id) return res.status(400).json({ error: 'cannot_ban_self' })
  if (await blockIfFounder(req, res)) return
  const banned = !!req.body?.banned
  const { data, error } = await req.supa.auth.admin.updateUserById(req.params.id, {
    ban_duration: banned ? '87600h' : 'none', // ~10 anos ou remove o ban
  })
  if (error) return res.status(502).json({ error: 'admin_failed', message: error.message })
  res.json({ user: toUserJson(data.user) })
})

// DELETE /api/admin/users/:id — exclui a conta (irreversível)
router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.adminUser.id) return res.status(400).json({ error: 'cannot_delete_self' })
  if (await blockIfFounder(req, res)) return
  const { error } = await req.supa.auth.admin.deleteUser(req.params.id)
  if (error) return res.status(502).json({ error: 'admin_failed', message: error.message })
  res.json({ ok: true })
})

export default router
