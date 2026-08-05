// ---------------------------------------------------------------------------
// POST /api/auth/email-hook — Send Email Hook do Supabase Auth.
// Em vez de o Supabase enviar o e-mail, ele chama ESTE endpoint; nós montamos o
// e-mail NO IDIOMA do usuário e enviamos pelo Resend. Assim os e-mails de auth
// saem em pt/en/es, com a marca Noctis Studio e do domínio próprio.
//
// Segurança: a requisição é assinada (Standard Webhooks). Validamos a assinatura
// com o SEND_EMAIL_HOOK_SECRET — sem isso, ninguém consegue disparar envios.
//
// Envs (Vercel): SEND_EMAIL_HOOK_SECRET, RESEND_API_KEY, EMAIL_FROM, SUPABASE_URL.
// IMPORTANTE: este handler precisa do CORPO CRU (Buffer) para validar a
// assinatura → é montado com express.raw() ANTES do express.json().
// ---------------------------------------------------------------------------
import crypto from 'crypto'
import { renderAuthEmail, templateKeyFor } from '../lib/authEmails.js'

// Verifica a assinatura Standard Webhooks (a mesma que o Supabase usa).
// secret no formato "v1,whsec_<base64>" (ou só "whsec_<base64>").
function verifySignature(rawBody, headers, secret) {
  try {
    const id = headers['webhook-id']
    const ts = headers['webhook-timestamp']
    const sigHeader = headers['webhook-signature']
    if (!id || !ts || !sigHeader || !secret) return false
    const base64 = secret.replace(/^v1,/, '').replace(/^whsec_/, '')
    const key = Buffer.from(base64, 'base64')
    const signed = `${id}.${ts}.${rawBody.toString('utf8')}`
    const expected = crypto.createHmac('sha256', key).update(signed).digest('base64')
    // O header traz uma lista separada por espaço: "v1,<sig> v1,<sig2>".
    for (const part of sigHeader.split(' ')) {
      const sig = part.includes(',') ? part.split(',')[1] : part
      const a = Buffer.from(sig)
      const b = Buffer.from(expected)
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}

async function sendViaResend({ to, subject, html }) {
  const from = process.env.EMAIL_FROM || 'Noctis Studio <noreply@noctis-studio.online>'
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!r.ok) throw new Error(`resend_${r.status}: ${await r.text().catch(() => '')}`)
}

export async function authEmailHook(req, res) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET
  if (!secret || !process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: { http_code: 500, message: 'email hook not configured' } })
  }
  // req.body é um Buffer (express.raw). Validar a assinatura ANTES de confiar.
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')
  if (!verifySignature(raw, req.headers, secret)) {
    return res.status(401).json({ error: { http_code: 401, message: 'invalid signature' } })
  }

  let payload
  try {
    payload = JSON.parse(raw.toString('utf8'))
  } catch {
    return res.status(400).json({ error: { http_code: 400, message: 'invalid json' } })
  }

  const user = payload?.user || {}
  const data = payload?.email_data || {}
  const key = templateKeyFor(data.email_action_type)
  if (!key) return res.status(200).json({}) // tipo desconhecido → deixa o Supabase seguir

  const locale = user.user_metadata?.locale || 'en'

  // Link de verificação (para tudo, menos reautenticação, que usa código).
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const redirect = encodeURIComponent(data.redirect_to || data.site_url || '')
  const url = `${supabaseUrl}/auth/v1/verify?token=${data.token_hash}&type=${data.email_action_type}&redirect_to=${redirect}`

  const email = renderAuthEmail({ key, locale, url, code: data.token })
  if (!email) return res.status(200).json({})

  // Troca de e-mail: o link vai para o NOVO endereço quando disponível.
  const to = key === 'email_change' && user.new_email ? user.new_email : user.email

  try {
    await sendViaResend({ to, subject: email.subject, html: email.html })
    return res.status(200).json({})
  } catch (err) {
    return res.status(500).json({ error: { http_code: 500, message: err.message } })
  }
}
