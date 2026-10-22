// Modelo de planos (não-fundador): FREE < BASIC < LITE < PRO. O fundador tem tudo
// ilimitado; MASTER é legado e equivale ao topo. O gating é "bloqueado mas visível":
// a página aparece no menu, mas abre um cartão de upgrade explicando pra que serve.

export const PLAN_RANK = { FREE: 0, BASIC: 1, LITE: 2, PRO: 3, MASTER: 4 }

// Limite de usos de IA por dia, por plano. PRO é ilimitado (Infinity), assim como
// o fundador. Os demais têm teto diário.
export const AI_DAILY_LIMIT = { FREE: 2, BASIC: 8, LITE: 20, PRO: Infinity }

// Plano mínimo para um colaborador ABRIR um workspace compartilhado.
export const COLLAB_MIN_PLAN = 'BASIC'

// Página (rota) → { min: plano mínimo, feature: chave i18n do cartão de bloqueio }.
// Rotas ausentes aqui são liberadas para todos os planos.
export const PAGE_GATE = {
  '/videos-imagens': { min: 'BASIC', feature: 'mediaBank' },
  '/transcricao': { min: 'BASIC', feature: 'transcription' },
  '/narracao': { min: 'BASIC', feature: 'narration' },
  '/estudio': { min: 'BASIC', feature: 'studio' },
  '/quadro-ideias': { min: 'BASIC', feature: 'ideaBoard' },
  '/desenhos': { min: 'BASIC', feature: 'drawings' },
  '/niche-finder': { min: 'LITE', feature: 'nicheFinder' },
  '/videos-virais': { min: 'LITE', feature: 'viralVideos' },
  '/dobra-de-nicho': { min: 'PRO', feature: 'nicheDoubling' },
  '/canais-removidos': { min: 'PRO', feature: 'removedChannels' },
  '/suporte': { min: 'BASIC', feature: 'community' },
}

export function planRank(plan) {
  return PLAN_RANK[plan] ?? 0
}

// Limite diário de IA do usuário (fundador/MASTER = ilimitado).
export function aiLimitFor(plan, isFounder) {
  if (isFounder || plan === 'MASTER' || plan === 'PRO') return Infinity
  return AI_DAILY_LIMIT[plan] ?? AI_DAILY_LIMIT.FREE
}

// O usuário (fundador ou plano) atinge o plano mínimo exigido?
export function meetsPlan(plan, isFounder, min) {
  return !!isFounder || planRank(plan) >= (PLAN_RANK[min] ?? 0)
}

// Rótulo amigável do plano.
export function planLabel(plan) {
  return plan === 'MASTER' ? 'Pro' : plan ? plan.charAt(0) + plan.slice(1).toLowerCase() : 'Free'
}
