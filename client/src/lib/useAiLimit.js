import { useDb } from './db'
import { useAuth } from '../auth/AuthContext'
import { aiLimitFor } from './plans'

// Uso de IA do dia = relatórios SEO + análises da Dobra + transcrições criados
// hoje (mesmo critério exibido em "Meu Plano"). O limite depende do plano.
// Retorna { ok, used, limit, remaining, unlimited } para gatear as ações de IA.
export function useAiLimit() {
  const db = useDb()
  const { user, isFounder } = useAuth()
  const today = new Date().toDateString()
  const isToday = (r) => new Date(r.createdAt).toDateString() === today
  const used =
    db.all('seoReports').filter(isToday).length +
    db.all('nicheAnalyses').filter(isToday).length +
    db.all('transcriptions').filter(isToday).length
  const limit = aiLimitFor(user?.plan, isFounder)
  const unlimited = !isFinite(limit)
  return { ok: unlimited || used < limit, used, limit, remaining: unlimited ? Infinity : Math.max(0, limit - used), unlimited }
}
