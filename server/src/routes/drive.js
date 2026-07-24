import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { encrypt, signState, verifyState } from '../lib/driveCrypto.js'

// Conexão do Google Drive por usuário (OAuth 2.0, escopo drive.file).
// Fluxo:
//   POST /api/drive/connect   (Bearer) -> devolve { url } de consentimento do Google
//   GET  /api/drive/callback           -> troca code por refresh_token, criptografa e salva
//   GET  /api/drive/status    (Bearer) -> { connected, email }
//   DELETE /api/drive/disconnect (Bearer)
const router = Router()

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

function requireSupabase(res) {
  const supa = supabaseAdmin()
  if (!supa) {
    res.status(400).json({ error: 'supabase_not_configured' })
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

// redirect_uri deve bater EXATAMENTE com o registrado no Google Cloud.
function redirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}/api/drive/callback`
}

function siteOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${proto}://${host}`
}

// Inicia a conexão: devolve a URL de consentimento com um state assinado.
router.post('/connect', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(400).json({ error: 'google_not_configured', message: 'Falta GOOGLE_CLIENT_ID no servidor.' })
  const state = signState({ uid: user.id, exp: Date.now() + 10 * 60 * 1000 })
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // pede refresh_token
    prompt: 'consent', // garante refresh_token mesmo em reconexão
    include_granted_scopes: 'true',
    state,
  })
  res.json({ url: `${GOOGLE_AUTH}?${params.toString()}` })
})

// Retorno do Google: troca o code por tokens e guarda o refresh_token cifrado.
router.get('/callback', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const origin = siteOrigin(req)
  const fail = (msg) => res.redirect(`${origin}/perfil?drive=erro&msg=${encodeURIComponent(msg || 'erro')}`)
  try {
    const { code, state, error } = req.query
    if (error) return fail(String(error))
    const payload = verifyState(state)
    if (!payload?.uid) return fail('state_invalido')
    if (!code) return fail('sem_code')

    const body = new URLSearchParams({
      code: String(code),
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    })
    const tokenRes = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    const tok = await tokenRes.json()
    if (!tokenRes.ok || !tok.refresh_token) {
      // Sem refresh_token (usuário já havia autorizado sem prompt=consent, etc.)
      return fail(tok.error_description || tok.error || 'sem_refresh_token')
    }

    // Descobre o e-mail da conta Google conectada (userinfo).
    let email = null
    try {
      const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } })
      if (info.ok) email = (await info.json()).email || null
    } catch {
      /* opcional */
    }

    await supa.from('drive_connections').upsert(
      {
        user_id: payload.uid,
        google_email: email,
        refresh_token_enc: encrypt(tok.refresh_token),
        scope: SCOPE,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    res.redirect(`${origin}/perfil?drive=conectado`)
  } catch (e) {
    fail(e?.message || 'erro')
  }
})

// Status da conexão do usuário logado.
router.get('/status', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const { data } = await supa.from('drive_connections').select('google_email, connected_at').eq('user_id', user.id).maybeSingle()
  res.json({ connected: !!data, email: data?.google_email || null })
})

router.delete('/disconnect', async (req, res) => {
  const supa = requireSupabase(res)
  if (!supa) return
  const user = await getUser(req, supa)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  await supa.from('drive_connections').delete().eq('user_id', user.id)
  res.json({ ok: true })
})

export default router
