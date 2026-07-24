import crypto from 'crypto'

// Criptografia dos refresh tokens do Google Drive (AES-256-GCM) e assinatura do
// "state" do OAuth (HMAC). A chave vem de DRIVE_TOKEN_ENC_KEY (32 bytes em hex).
function key() {
  const hex = process.env.DRIVE_TOKEN_ENC_KEY || ''
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) throw new Error('DRIVE_TOKEN_ENC_KEY inválida (precisa de 32 bytes em hex)')
  return buf
}

// texto -> base64 (iv | tag | ciphertext)
export function encrypt(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decrypt(b64) {
  const raw = Buffer.from(b64, 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const enc = raw.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

// "state" do OAuth: payload assinado (HMAC) para amarrar o callback ao usuário
// que iniciou o fluxo, sem confiar em nada que volte do Google.
export function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', process.env.DRIVE_TOKEN_ENC_KEY || '').update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyState(state) {
  const [body, sig] = String(state || '').split('.')
  if (!body || !sig) return null
  const expect = crypto.createHmac('sha256', process.env.DRIVE_TOKEN_ENC_KEY || '').update(body).digest('base64url')
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (p.exp && Date.now() > p.exp) return null
    return p
  } catch {
    return null
  }
}
