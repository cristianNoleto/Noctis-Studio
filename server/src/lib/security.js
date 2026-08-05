// ---------------------------------------------------------------------------
// Cabeçalhos de segurança + rate limiting básico. Middleware sem dependências
// (funciona igual no Express local e na função serverless da Vercel).
//
// IMPORTANTE sobre rate limiting em serverless: o contador vive na MEMÓRIA da
// instância. Na Vercel há várias instâncias e cold starts, então isto é uma
// proteção "best-effort" contra rajadas por instância — NÃO um limite global
// rígido. Para um teto global de verdade, usar um store externo (Upstash/Redis)
// ou o rate limiting nativo da Vercel. Ainda assim, corta abuso trivial.
// ---------------------------------------------------------------------------

// Aplica cabeçalhos de segurança em toda resposta.
export function securityHeaders(_req, res, next) {
  // Força HTTPS por 180 dias (a Vercel já serve em HTTPS).
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  // O navegador não "adivinha" o content-type (anti MIME-sniffing).
  res.setHeader('X-Content-Type-Options', 'nosniff')
  // Ninguém embute o app num iframe (anti-clickjacking).
  res.setHeader('X-Frame-Options', 'DENY')
  // Não vaza a URL completa como referer para outros sites.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Desliga APIs sensíveis que o app não usa.
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()')
  next()
}

// Rate limiter em memória (janela deslizante simples por chave IP+rota-base).
const buckets = new Map() // key -> { count, resetAt }

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

// Cria um middleware que limita `max` requisições por `windowMs` por IP.
export function rateLimit({ windowMs = 60_000, max = 60, name = 'default' } = {}) {
  return (req, res, next) => {
    const key = `${name}:${clientIp(req)}`
    const now = Date.now()
    let b = buckets.get(key)
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + windowMs }
      buckets.set(key, b)
    }
    b.count += 1
    if (b.count > max) {
      const retry = Math.ceil((b.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retry))
      return res.status(429).json({ error: 'rate_limited', message: 'Muitas requisições. Tente novamente em instantes.' })
    }
    next()
  }
}

// Limpeza preguiçosa: quando o mapa cresce, remove janelas já expiradas (evita
// vazamento de memória em instâncias muito aquecidas).
function sweep() {
  if (buckets.size < 5000) return
  const now = Date.now()
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
}
setInterval(sweep, 60_000).unref?.()
