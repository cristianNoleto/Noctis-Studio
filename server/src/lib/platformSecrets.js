import crypto from 'crypto'
import { supabaseAdmin } from './supabaseAdmin.js'

// ---------------------------------------------------------------------------
// Segredos da plataforma (ex.: a chave do ElevenLabs do DONO, não BYOK).
// Guardados CIFRADOS (AES-256-GCM) na tabela platform_secrets, que só a service
// role acessa. O valor em claro NUNCA vai ao navegador: o admin cola a chave no
// site, o servidor cifra e salva; na hora de gerar áudio, o servidor decifra e
// usa. A chave de cifragem é DRIVE_TOKEN_ENC_KEY (mesma do Drive: 32 bytes hex).
// ---------------------------------------------------------------------------

function encKey() {
  const hex = process.env.DRIVE_TOKEN_ENC_KEY || ''
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) {
    throw Object.assign(new Error('DRIVE_TOKEN_ENC_KEY ausente/inválida (precisa de 32 bytes em hex).'), { code: 'enc_key_missing' })
  }
  return buf
}

// texto -> base64(iv | tag | ciphertext)
function encrypt(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decrypt(b64) {
  const raw = Buffer.from(b64, 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const enc = raw.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

// Grava um segredo cifrado (upsert por chave). Lança se não houver service role
// ou chave de cifragem.
export async function setSecret(key, plain) {
  const supa = supabaseAdmin()
  if (!supa) throw Object.assign(new Error('Supabase service role não configurado.'), { code: 'not_configured' })
  const value = encrypt(plain)
  const { error } = await supa
    .from('platform_secrets')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw Object.assign(new Error(error.message), { code: 'secret_write_failed' })
}

// Lê e decifra um segredo. Retorna null quando não existe (ou sem service role).
export async function getSecret(key) {
  const supa = supabaseAdmin()
  if (!supa) return null
  const { data } = await supa.from('platform_secrets').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return null
  try {
    return decrypt(data.value)
  } catch {
    return null // chave de cifragem trocada ou dado corrompido → trata como ausente
  }
}

export async function deleteSecret(key) {
  const supa = supabaseAdmin()
  if (!supa) return
  await supa.from('platform_secrets').delete().eq('key', key)
}

// Config NÃO-secreta da plataforma, em app_state.key (jsonb). Leitura liberada.
export async function getAppState(key, fallback = null) {
  const supa = supabaseAdmin()
  if (!supa) return fallback
  const { data } = await supa.from('app_state').select('value').eq('key', key).maybeSingle()
  return data?.value ?? fallback
}

export async function setAppState(key, value) {
  const supa = supabaseAdmin()
  if (!supa) throw Object.assign(new Error('Supabase service role não configurado.'), { code: 'not_configured' })
  const { error } = await supa.from('app_state').upsert({ key, value }, { onConflict: 'key' })
  if (error) throw Object.assign(new Error(error.message), { code: 'state_write_failed' })
}
