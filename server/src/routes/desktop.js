import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Noctis Studio Desktop — download do instalador e login do programa.
//   Só quem tem conta no Noctis Studio usa: as duas rotas exigem o token JWT do
//   site (Authorization: Bearer). Nada aqui é público.
//
//   GET  /api/desktop/download → link TEMPORÁRIO do instalador mais recente.
//        O instalador vive nas Releases deste repositório (privado). O servidor
//        pede o asset ao GitHub com GITHUB_RELEASES_TOKEN e devolve só a URL
//        assinada (expira em minutos) — o token nunca sai daqui.
//   POST /api/desktop/session  → credencial de uso único para o programa abrir
//        a PRÓPRIA sessão (verifyOtp com token_hash). Sessão separada da do
//        site: renovar no programa não derruba o login do navegador.
const router = Router()

const RANK = { FREE: 0, BASIC: 1, LITE: 2, PRO: 3, MASTER: 4 }

function founderEmails() {
  return (process.env.FOUNDER_EMAIL || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

// Plano mínimo para usar o programa. Padrão FREE = basta ter conta.
function minPlan() {
  const p = String(process.env.DESKTOP_MIN_PLAN || 'FREE').toUpperCase()
  return RANK[p] === undefined ? 'FREE' : p
}

function planOf(user) {
  if (founderEmails().includes((user.email || '').toLowerCase())) return 'MASTER'
  return user.app_metadata?.plan || 'FREE'
}

async function requireMember(req, res) {
  const supa = supabaseAdmin()
  if (!supa) {
    res.status(500).json({ error: 'supabase_not_configured', message: 'Configure SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY na Vercel.' })
    return null
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) { res.status(401).json({ error: 'unauthorized', message: 'Entre na sua conta do Noctis Studio.' }); return null }
  const { data, error } = await supa.auth.getUser(token)
  const user = data?.user
  if (error || !user) { res.status(401).json({ error: 'unauthorized', message: 'Sessão expirada. Entre de novo.' }); return null }
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    res.status(403).json({ error: 'banned', message: 'Esta conta está suspensa.' })
    return null
  }
  const plan = planOf(user)
  const min = minPlan()
  if ((RANK[plan] ?? 0) < RANK[min]) {
    res.status(403).json({ error: 'plan_required', min, plan, message: `O Noctis Studio Desktop exige o plano ${min} ou superior.` })
    return null
  }
  return { supa, user, plan }
}

function releasesConfig() {
  return {
    repo: process.env.DESKTOP_RELEASES_REPO || 'cristianNoleto/Noctis-Studio',
    token: process.env.GITHUB_RELEASES_TOKEN || '',
  }
}

async function gh(path, token, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'noctis-studio-desktop-download',
      ...(init.headers || {}),
    },
  })
}

// Release mais recente com tag desktop-v* (o repositório também pode ter outras releases).
async function latestDesktopRelease(repo, token) {
  const r = await gh(`/repos/${repo}/releases?per_page=30`, token, { headers: { Accept: 'application/vnd.github+json' } })
  if (!r.ok) throw Object.assign(new Error(`GitHub respondeu ${r.status} ao listar releases.`), { status: r.status })
  const list = await r.json()
  return list.find((rel) => !rel.draft && /^desktop-v/.test(rel.tag_name) && rel.assets?.some((a) => /\.exe$/i.test(a.name))) || null
}

router.get('/info', async (req, res) => {
  const ctx = await requireMember(req, res)
  if (!ctx) return
  const { repo, token } = releasesConfig()
  if (!token) return res.json({ available: false, reason: 'not_configured', plan: ctx.plan })
  try {
    const rel = await latestDesktopRelease(repo, token)
    if (!rel) return res.json({ available: false, reason: 'no_release', plan: ctx.plan })
    const asset = rel.assets.find((a) => /\.exe$/i.test(a.name))
    res.json({
      available: true,
      plan: ctx.plan,
      version: rel.tag_name.replace(/^desktop-v/, ''),
      publishedAt: rel.published_at,
      fileName: asset.name,
      size: asset.size,
      notes: (rel.body || '').slice(0, 4000),
    })
  } catch (e) {
    res.status(502).json({ error: 'github_error', message: e.message })
  }
})

router.get('/download', async (req, res) => {
  const ctx = await requireMember(req, res)
  if (!ctx) return
  const { repo, token } = releasesConfig()
  if (!token) {
    return res.status(503).json({ error: 'not_configured', message: 'Download ainda não configurado: falta GITHUB_RELEASES_TOKEN na Vercel.' })
  }
  try {
    const rel = await latestDesktopRelease(repo, token)
    const asset = rel?.assets.find((a) => /\.exe$/i.test(a.name))
    if (!asset) return res.status(404).json({ error: 'no_release', message: 'Ainda não há instalador publicado.' })
    // Pedir o asset como octet-stream devolve 302 para uma URL assinada e temporária.
    const r = await gh(`/repos/${repo}/releases/assets/${asset.id}`, token, {
      headers: { Accept: 'application/octet-stream' },
      redirect: 'manual',
    })
    const url = r.headers.get('location')
    if (!url) throw new Error(`GitHub respondeu ${r.status} ao gerar o link do instalador.`)
    res.json({ url, fileName: asset.name, version: rel.tag_name.replace(/^desktop-v/, '') })
  } catch (e) {
    res.status(502).json({ error: 'github_error', message: e.message })
  }
})

// Feed de atualização automática do app (electron-updater, provider "generic").
//   O app pede /update/latest.yml e depois /update/<instalador>.exe (e .blockmap).
//   Tudo passa pela conta Noctis (Authorization: Bearer). Para o .exe e o .blockmap
//   devolvemos um redirect para a URL assinada do asset (não trafega 130 MB pelo servidor);
//   o latest.yml é pequeno e vai no corpo.
const ARQUIVO_UPDATE = /^[\w.-]+\.(ya?ml|exe|blockmap)$/i

router.get('/update/:file', async (req, res) => {
  const nome = req.params.file
  if (!ARQUIVO_UPDATE.test(nome) || nome.includes('..')) {
    return res.status(400).json({ error: 'bad_file' })
  }
  const ctx = await requireMember(req, res)
  if (!ctx) return
  const { repo, token } = releasesConfig()
  if (!token) return res.status(503).json({ error: 'not_configured', message: 'Atualização não configurada: falta GITHUB_RELEASES_TOKEN na Vercel.' })
  try {
    const rel = await latestDesktopRelease(repo, token)
    const asset = rel?.assets.find((a) => a.name.toLowerCase() === nome.toLowerCase())
    if (!asset) return res.status(404).json({ error: 'not_found', message: `Arquivo ${nome} não está na release.` })
    const r = await gh(`/repos/${repo}/releases/assets/${asset.id}`, token, {
      headers: { Accept: 'application/octet-stream' },
      redirect: 'manual',
    })
    const url = r.headers.get('location')
    if (!url) throw new Error(`GitHub respondeu ${r.status} ao buscar ${nome}.`)
    // .yml é pequeno: entrega o conteúdo direto (electron-updater lê o corpo).
    if (/\.ya?ml$/i.test(nome)) {
      const conteudo = await fetch(url).then((x) => x.text())
      res.type('text/yaml').send(conteudo)
      return
    }
    res.redirect(302, url) // .exe / .blockmap → URL assinada e temporária
  } catch (e) {
    res.status(502).json({ error: 'github_error', message: e.message })
  }
})

// Login do app com e-mail e senha (alternativa ao login pelo navegador).
//   O formulário do site usa hCaptcha; o app não consegue exibir o captcha (roda fora do
//   domínio do site), então a troca da senha por uma sessão acontece AQUI, com a chave de
//   serviço (o Supabase dispensa o captcha para chamadas de servidor). Proteção contra força
//   bruta: limite próprio em api/index.js (10 tentativas / 15 min por IP).
//   Devolve uma sessão PRÓPRIA do app (separada da do navegador) + URL/anon key públicos do
//   Supabase, que o app usa para renovar o token depois.
router.post('/password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 200) {
    return res.status(400).json({ error: 'bad_request', message: 'Informe e-mail e senha.' })
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !service || !anon) return res.status(500).json({ error: 'not_configured', message: 'Login por senha não configurado no servidor.' })
  try {
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.access_token) {
      const msg = String(data.msg || data.error_description || data.message || '')
      if (/email not confirmed/i.test(msg)) return res.status(403).json({ error: 'email_not_confirmed', message: 'Confirme seu e-mail antes de entrar (veja a caixa de entrada).' })
      return res.status(401).json({ error: 'invalid_credentials', message: 'E-mail ou senha incorretos.' })
    }
    const user = data.user || {}
    if (user.banned_until && new Date(user.banned_until) > new Date()) return res.status(403).json({ error: 'banned', message: 'Esta conta está suspensa.' })
    const plan = planOf(user)
    if ((RANK[plan] ?? 0) < RANK[minPlan()]) return res.status(403).json({ error: 'plan_required', message: `O Noctis Studio Desktop exige o plano ${minPlan()} ou superior.` })
    res.json({ url, key: anon, session: { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in, user } })
  } catch (e) {
    res.status(502).json({ error: 'auth_error', message: `Não foi possível entrar agora: ${e.message}` })
  }
})

router.post('/session', async (req, res) => {
  const ctx = await requireMember(req, res)
  if (!ctx) return
  if (!ctx.user.email) return res.status(400).json({ error: 'no_email', message: 'Conta sem e-mail.' })
  // generateLink NÃO envia e-mail: só devolve o token, que o programa troca por uma sessão nova.
  const { data, error } = await ctx.supa.auth.admin.generateLink({ type: 'magiclink', email: ctx.user.email })
  const hash = data?.properties?.hashed_token
  if (error || !hash) return res.status(500).json({ error: 'link_failed', message: error?.message || 'Não foi possível gerar o acesso.' })
  res.json({ token_hash: hash, email: ctx.user.email, plan: ctx.plan })
})

export default router
