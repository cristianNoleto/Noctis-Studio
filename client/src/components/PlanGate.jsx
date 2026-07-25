import { useLocation, Link } from 'react-router-dom'
import { Lock, Crown, ArrowUpRight } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { PAGE_GATE, meetsPlan, planRank, COLLAB_MIN_PLAN, planLabel } from '../lib/plans'
import { btnPrimary } from './ui'

// Envolve uma página: se o plano do usuário não alcança o mínimo, mostra um
// cartão de upgrade (explica pra que serve) em vez do conteúdo. Fundador passa
// sempre. Colaborador (workspace de outro) precisa de plano mínimo p/ usar.
export function PlanGate({ children }) {
  const { pathname } = useLocation()
  const { user, isFounder } = useAuth()
  const db = useDb()
  // Bate exato ou pelo 1º segmento (ex.: /desenhos/:id → /desenhos).
  const gate = PAGE_GATE[pathname] || PAGE_GATE[`/${pathname.split('/')[1]}`]
  const plan = user?.plan
  const inSharedWs = !!db.activeWorkspace()

  if (inSharedWs && !isFounder && planRank(plan) < planRank(COLLAB_MIN_PLAN)) {
    return <UpgradeLock feature="collabWorkspace" min={COLLAB_MIN_PLAN} plan={plan} />
  }
  if (gate && !meetsPlan(plan, isFounder, gate.min)) {
    return <UpgradeLock feature={gate.feature} min={gate.min} plan={plan} />
  }
  return children
}

function UpgradeLock({ feature, min, plan }) {
  const { t } = useI18n()
  return (
    <div className="mx-auto mt-6 flex max-w-xl flex-col items-center rounded-2xl border border-cyan-500/20 bg-slate-900/40 p-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-400">
        <Lock size={28} />
      </div>
      <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-400">
        <Crown size={12} /> {t('plans.locked.badge', { plan: planLabel(min) })}
      </span>
      <h2 className="text-xl font-bold text-slate-100">{t(`plans.features.${feature}.name`)}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{t(`plans.features.${feature}.desc`)}</p>
      <p className="mt-4 text-xs text-slate-500">{t('plans.locked.current', { plan: planLabel(plan) })}</p>
      <Link to="/meu-plano" className={`${btnPrimary} mt-5 inline-flex items-center gap-2`}>
        {t('plans.locked.cta')} <ArrowUpRight size={15} />
      </Link>
    </div>
  )
}
