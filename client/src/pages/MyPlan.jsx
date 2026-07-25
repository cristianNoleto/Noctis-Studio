import { useState } from 'react'
import { Crown, Check, X, ChevronDown, MessageCircle, Sparkles } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { aiLimitFor, AI_DAILY_LIMIT } from '../lib/plans'

// Página "Meu Plano" — layout do original (uso diário, plano atual, pricing
// Mensal/Trimestral com features e FAQ), com a marca Noctis.
// Chaves das features (rótulos traduzidos em myPlan.features.*)
const FEATURE_KEYS = ['channels', 'similar', 'niche', 'viral', 'api', 'community']

// [nome de marca, preço mensal, trimestral (por mês), key i18n, quantas features, popular]
const PLANS = [
  { name: 'Noctis Free', monthly: 0, quarterly: 0, key: 'free', features: 2, noCard: true },
  { name: 'Noctis Basic', monthly: 49.99, quarterly: 39.99, key: 'basic', features: 4 },
  { name: 'Noctis Lite', monthly: 79.99, quarterly: 63.99, key: 'lite', features: 5 },
  { name: 'Noctis Pro', monthly: 109.99, quarterly: 87.99, key: 'pro', features: 6, popular: true },
]

function price(n) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function MyPlan() {
  const { user, isAdmin } = useAuth()
  const db = useDb()
  const { t } = useI18n()
  const [cycle, setCycle] = useState('monthly')
  const [openFaq, setOpenFaq] = useState(null)

  // Uso real do dia: gerações de IA + transcrições de hoje
  const today = new Date().toDateString()
  const usedToday =
    db.all('seoReports').filter((r) => new Date(r.createdAt).toDateString() === today).length +
    db.all('nicheAnalyses').filter((r) => new Date(r.createdAt).toDateString() === today).length +
    db.all('transcriptions').filter((r) => new Date(r.createdAt).toDateString() === today).length
  const isFounder = isAdmin
  const LIMIT = aiLimitFor(user?.plan, isFounder) // limite real do plano
  const unlimited = !isFinite(LIMIT)
  const limitLabel = unlimited ? '∞' : LIMIT
  const pct = unlimited ? 0 : Math.min(100, Math.round((usedToday / LIMIT) * 100))

  const planName = isFounder ? t('myPlan.founder') : user?.plan || 'FREE'
  const renewal = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('pt-BR')

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('myPlan.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('myPlan.subtitle')}</p>
      </div>

      {/* Uso de áudios + Plano atual */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Sparkles size={15} className="text-cyan-400" />
              {t('myPlan.aiUsage')}
            </p>
            <span className="text-xs font-semibold text-slate-300">
              {t('myPlan.usedOfToday', { used: usedToday, limit: limitLabel })}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>{t('myPlan.usageSources')}</span>
            <span>{t('myPlan.renewsDaily')}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">{t('myPlan.currentPlan')}</p>
            <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] font-bold text-green-400">
              <span className="online-dot h-1.5 w-1.5 rounded-full bg-green-400" />
              {t('myPlan.active')}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Crown size={20} />
            </div>
            <div>
              <p className="text-lg font-extrabold text-slate-100">{planName}</p>
              <p className="text-xs text-slate-500">{t('myPlan.nextBilling')} {isFounder ? '—' : renewal}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-red-500/40 hover:text-red-400">
              {t('myPlan.cancelPlan')}
            </button>
            <button className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700">
              {t('myPlan.contactSupport')}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-slate-600">{t('myPlan.cancelNote')}</p>
        </div>
      </div>

      {/* Toggle Mensal / Trimestral */}
      <div className="flex justify-center">
        <div className="flex gap-1 rounded-full border border-slate-800 bg-slate-900 p-1 text-xs font-semibold">
          <button
            onClick={() => setCycle('monthly')}
            className={`rounded-full px-4 py-1.5 transition-colors ${cycle === 'monthly' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t('myPlan.monthly')}
          </button>
          <button
            onClick={() => setCycle('quarterly')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 transition-colors ${
              cycle === 'quarterly' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('myPlan.quarterly')}
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cycle === 'quarterly' ? 'bg-white/20 text-white' : 'bg-green-500/15 text-green-400'}`}>
              {t('myPlan.save')}
            </span>
          </button>
        </div>
      </div>

      {/* Cards de pricing */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const current = p.popular // no modo local o plano equivalente é o Pro
          const value = cycle === 'monthly' ? p.monthly : p.quarterly
          const planCode = p.key.toUpperCase() // free/basic/lite/pro → FREE/...
          const aiPerDay = AI_DAILY_LIMIT[planCode] ?? AI_DAILY_LIMIT.FREE
          return (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-xl border bg-slate-900/40 p-5 ${
                p.popular ? 'border-cyan-500/60 shadow-[0_0_30px_-12px_rgba(0,242,254,0.4)]' : 'border-slate-800'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-cyan-500 px-3 py-0.5 text-[10px] font-bold text-white">
                  {t('myPlan.mostPopular')}
                </span>
              )}
              <p className="font-bold text-slate-100">{p.name}</p>
              {value === 0 ? (
                <p className="mt-1.5 text-2xl font-extrabold text-slate-100">{t('myPlan.free')}</p>
              ) : (
                <p className="mt-1.5 text-slate-100">
                  <span className="align-top text-sm font-semibold text-slate-400">{t('myPlan.currency')}</span>
                  <span className="text-2xl font-extrabold">{price(value)}</span>
                  <span className="text-xs text-slate-500">{t('myPlan.perMonth')}</span>
                </p>
              )}
              <p className="text-[10px] text-slate-600">{p.noCard ? t('myPlan.noCard') : cycle === 'monthly' ? t('myPlan.billedMonthly') : t('myPlan.billedQuarterly')}</p>

              <p className="mt-3 text-xs font-semibold text-cyan-300">{t(`myPlan.plans.${p.key}.summary`)}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-300">
                {isFinite(aiPerDay) ? t('myPlan.aiPerDay', { n: aiPerDay }) : t('myPlan.aiUnlimited')}
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{t(`myPlan.plans.${p.key}.desc`)}</p>

              <button
                disabled
                className={`mt-4 w-full rounded-lg py-2 text-xs font-bold ${
                  current ? 'bg-cyan-500/15 text-cyan-300' : 'cursor-not-allowed border border-slate-800 bg-slate-900 text-slate-600'
                }`}
              >
                {current ? t('myPlan.currentPlanBtn') : t('myPlan.unavailable')}
              </button>

              <ul className="mt-4 space-y-1.5 border-t border-slate-800 pt-3.5">
                {FEATURE_KEYS.map((fk, i) => {
                  // Comunidade: todo plano PAGO tem (do Basic ao Pro). Demais: por contagem.
                  const has = fk === 'community' ? !p.noCard : i < p.features
                  return (
                    <li key={fk} className={`flex items-center gap-1.5 text-xs ${has ? 'text-slate-300' : 'text-slate-600'}`}>
                      {has ? <Check size={12} className="shrink-0 text-cyan-400" /> : <X size={12} className="shrink-0 text-slate-700" />}
                      {t(`myPlan.features.${fk}`)}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      {/* FAQ */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-3 font-semibold text-slate-100">{t('myPlan.faqTitle')}</h2>
        <div className="divide-y divide-slate-800">
          {t('myPlan.faq').map(({ q, a }, i) => (
            <div key={q}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                <span className="text-sm font-medium text-slate-200">{q}</span>
                <ChevronDown size={15} className={`shrink-0 text-slate-500 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
              </button>
              {openFaq === i && <p className="pb-3.5 text-xs leading-relaxed text-slate-400">{a}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Precisa de ajuda? */}
      <div className="flex items-center justify-between rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-4">
        <p className="text-sm font-semibold text-slate-200">{t('myPlan.needHelp')}</p>
        <a href="/suporte" className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-cyan-600">
          <MessageCircle size={13} />
          {t('myPlan.talkToSupport')}
        </a>
      </div>
    </div>
  )
}
