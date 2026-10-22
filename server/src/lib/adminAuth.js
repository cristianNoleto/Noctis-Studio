import { supabaseAdmin } from './supabaseAdmin.js'

// ---------------------------------------------------------------------------
// Guarda de admin reutilizável (mesma regra do api/_admin.js): exige token JWT
// do Supabase válido E e-mail na allowlist ADMIN_EMAILS (o FOUNDER_EMAIL é
// sempre admin). Diferente do api/_admin.js, este roda também no servidor local
// (server/src/index.js), então as rotas de admin do TTS funcionam nos dois.
//
// Uso:  const ctx = await requireAdmin(req, res); if (!ctx) return
//       // ctx = { supa, user }
// ---------------------------------------------------------------------------

function parseEmails(v) {
  return (v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function adminEmails() {
  const founders = parseEmails(process.env.FOUNDER_EMAIL)
  return [...new Set([...parseEmails(process.env.ADMIN_EMAILS), ...founders])]
}

export function founderEmails() {
  return parseEmails(process.env.FOUNDER_EMAIL)
}

export async function requireAdmin(req, res) {
  const supa = supabaseAdmin()
  const admins = adminEmails()
  if (!supa || !admins.length) {
    res.status(500).json({
      error: 'admin_not_configured',
      message: 'Configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e ADMIN_EMAILS/FOUNDER_EMAIL no servidor.',
    })
    return null
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  const { data, error } = await supa.auth.getUser(token)
  if (error || !data?.user) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  if (!admins.includes((data.user.email || '').toLowerCase())) {
    res.status(403).json({ error: 'forbidden', message: 'Este e-mail não está em ADMIN_EMAILS.' })
    return null
  }
  return { supa, user: data.user }
}
