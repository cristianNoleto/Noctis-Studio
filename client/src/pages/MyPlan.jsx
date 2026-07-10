import { useState } from 'react'
import { Crown, Check, X, ChevronDown, MessageCircle, AudioLines } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useDb } from '../lib/db'

// Página "Meu Plano" — layout do original (uso diário, plano atual, pricing
// Mensal/Trimestral com features e FAQ), com a marca Noctis.
const FEATURES = [
  'Gestão de Canais',
  'Extensão YouTube',
  'Similar Channels',
  'Niche Finder',
  'Vídeos Virais',
  'App Noctis',
  'Acesso à API',
  'Acesso à comunidade',
]

// [nome, preço mensal, preço trimestral (por mês), destaque, resumo, créditos, descrição]
const PLANS = [
  {
    name: 'Noctis Free',
    monthly: 0,
    quarterly: 0,
    summary: '5 áudios no total · até 80 mil caracteres',
    credits: '400 mil créditos no total',
    desc: 'Equivalente a 400 mil créditos no total para testar (não renovam). Cada geração conta como 1 áudio, então você pode fazer 5 áudios no total, e cada um pode ter até 80 mil caracteres.',
    sub: 'Sem cartão de crédito',
    features: 2,
  },
  {
    name: 'Noctis Basic',
    monthly: 49.99,
    quarterly: 39.99,
    summary: '15 áudios/dia · até 80 mil caracteres',
    credits: '1,2 mi créditos/dia',
    desc: 'Equivalente a 1,2 mi créditos por dia para gerar áudio. Cada geração conta como 1 áudio, então você pode fazer 15 áudios por dia, e cada áudio pode ter até 80 mil caracteres. Renovam todos os dias.',
    features: 5,
  },
  {
    name: 'Noctis Lite',
    monthly: 79.99,
    quarterly: 63.99,
    summary: '25 áudios/dia · até 120 mil caracteres',
    credits: '3 mi créditos/dia',
    desc: 'Equivalente a 3 mi créditos por dia para gerar áudio. Cada geração conta como 1 áudio, então você pode fazer 25 áudios por dia, e cada áudio pode ter até 120 mil caracteres. Renovam todos os dias.',
    features: 7,
  },
  {
    name: 'Noctis Pro',
    monthly: 109.99,
    quarterly: 87.99,
    summary: '50 áudios/dia · até 150 mil caracteres',
    credits: '7,5 mi créditos/dia',
    desc: 'Equivalente a 7,5 mi créditos por dia para gerar áudio. Cada geração conta como 1 áudio, então você pode fazer 50 áudios por dia, e cada áudio pode ter até 150 mil caracteres. Renovam todos os dias.',
    popular: true,
    features: 8,
  },
]

const FAQ = [
  [
    'Quando posso cancelar minha assinatura?',
    'Quando quiser. Sua assinatura permanece ativa até a data de renovação e não há multa de cancelamento.',
  ],
  [
    'Como funcionam os caracteres e os créditos?',
    'Cada caractere de texto conta como 1 crédito. Cada plano tem um limite de áudios por dia e de caracteres por áudio, e o limite de caracteres vale para cada áudio (não é somado). Por exemplo, no plano Pro você pode fazer até 50 áudios por dia, cada um com até 150 mil caracteres, o equivalente a 7,5 milhões de créditos por dia. Os créditos renovam todos os dias e não acumulam de um dia para o outro. No plano Free são 5 áudios no total para testar, que não renovam.',
  ],
  ['Sou cobrado por cada geração?', 'Não — o plano é uma mensalidade fixa. As gerações consomem apenas o limite diário incluso.'],
  [
    'O que está incluído e como funciona o acesso à comunidade?',
    'Todos os planos pagos incluem as ferramentas de gestão, pesquisa (Niche Finder, Vídeos Virais, Dobra de Nicho) e a comunidade no WhatsApp/Discord.',
  ],
  ['Quais formas de pagamento vocês aceitam?', 'Cartão de crédito e Pix.'],
  ['Tem alguma taxa além do valor do plano?', 'Não. O valor do plano é o único custo — sem taxa de adesão ou cobrança extra.'],
  ['O que acontece quando eu cancelo?', 'Você mantém o acesso até o fim do período já pago; depois a conta volta ao plano Free.'],
  ['Posso mudar para um plano menor (downgrade)?', 'Sim, a qualquer momento — o novo valor passa a valer na próxima renovação.'],
  ['As atualizações estão inclusas?', 'Sim. Toda atualização da plataforma entra automaticamente para todos os assinantes.'],
]

function price(n) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function MyPlan() {
  const { user, isAdmin } = useAuth()
  const db = useDb()
  const [cycle, setCycle] = useState('monthly')
  const [openFaq, setOpenFaq] = useState(null)

  // Uso real do dia: gerações de IA + transcrições de hoje
  const today = new Date().toDateString()
  const usedToday =
    db.all('seoReports').filter((r) => new Date(r.createdAt).toDateString() === today).length +
    db.all('nicheAnalyses').filter((r) => new Date(r.createdAt).toDateString() === today).length +
    db.all('transcriptions').filter((r) => new Date(r.createdAt).toDateString() === today).length
  const LIMIT = 40
  const pct = Math.min(100, Math.round((usedToday / LIMIT) * 100))

  const planName = isAdmin ? 'FUNDADOR' : user?.plan || 'FREE'
  const renewal = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('pt-BR')

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Meu Plano</h1>
        <p className="mt-1 text-sm text-slate-500">Gerencie sua assinatura</p>
      </div>

      {/* Uso de áudios + Plano atual */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <AudioLines size={15} className="text-cyan-400" />
              Uso de áudios
            </p>
            <span className="text-xs font-semibold text-slate-300">
              {usedToday} de {LIMIT} hoje
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Até 120.000 caracteres por áudio</span>
            <span>Renova todos os dias</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-200">Plano atual</p>
            <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] font-bold text-green-400">
              <span className="online-dot h-1.5 w-1.5 rounded-full bg-green-400" />
              Ativo
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Crown size={20} />
            </div>
            <div>
              <p className="text-lg font-extrabold text-slate-100">{planName === 'FUNDADOR' ? '👑 FUNDADOR' : planName}</p>
              <p className="text-xs text-slate-500">Próxima cobrança: {planName === 'FUNDADOR' ? '—' : renewal}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-red-500/40 hover:text-red-400">
              Cancelar plano
            </button>
            <button className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700">
              Falar com o suporte
            </button>
          </div>
          <p className="mt-3 text-[11px] text-slate-600">Cancele quando quiser: sua assinatura permanece ativa até a data de renovação.</p>
        </div>
      </div>

      {/* Toggle Mensal / Trimestral */}
      <div className="flex justify-center">
        <div className="flex gap-1 rounded-full border border-slate-800 bg-slate-900 p-1 text-xs font-semibold">
          <button
            onClick={() => setCycle('monthly')}
            className={`rounded-full px-4 py-1.5 transition-colors ${cycle === 'monthly' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Mensal
          </button>
          <button
            onClick={() => setCycle('quarterly')}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 transition-colors ${
              cycle === 'quarterly' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Trimestral
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${cycle === 'quarterly' ? 'bg-white/20 text-white' : 'bg-green-500/15 text-green-400'}`}>
              Economize
            </span>
          </button>
        </div>
      </div>

      {/* Cards de pricing */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => {
          const current = p.popular // no modo local o plano equivalente é o Pro
          const value = cycle === 'monthly' ? p.monthly : p.quarterly
          return (
            <div
              key={p.name}
              className={`relative flex flex-col rounded-xl border bg-slate-900/40 p-5 ${
                p.popular ? 'border-cyan-500/60 shadow-[0_0_30px_-12px_rgba(0,242,254,0.4)]' : 'border-slate-800'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-cyan-500 px-3 py-0.5 text-[10px] font-bold text-white">
                  Most Popular
                </span>
              )}
              <p className="font-bold text-slate-100">{p.name}</p>
              {value === 0 ? (
                <p className="mt-1.5 text-2xl font-extrabold text-slate-100">Grátis</p>
              ) : (
                <p className="mt-1.5 text-slate-100">
                  <span className="align-top text-sm font-semibold text-slate-400">R$ </span>
                  <span className="text-2xl font-extrabold">{price(value)}</span>
                  <span className="text-xs text-slate-500">/mês</span>
                </p>
              )}
              <p className="text-[10px] text-slate-600">{p.sub || (cycle === 'monthly' ? 'cobrado mensalmente' : 'cobrado a cada 3 meses')}</p>

              <p className="mt-3 text-xs font-semibold text-cyan-300">{p.summary}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-300">{p.credits}</p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">{p.desc}</p>

              <button
                disabled
                className={`mt-4 w-full rounded-lg py-2 text-xs font-bold ${
                  current ? 'bg-cyan-500/15 text-cyan-300' : 'cursor-not-allowed border border-slate-800 bg-slate-900 text-slate-600'
                }`}
              >
                {current ? 'Plano atual' : 'Indisponível'}
              </button>

              <ul className="mt-4 space-y-1.5 border-t border-slate-800 pt-3.5">
                {FEATURES.map((f, i) => {
                  const has = i < p.features
                  return (
                    <li key={f} className={`flex items-center gap-1.5 text-xs ${has ? 'text-slate-300' : 'text-slate-600'}`}>
                      {has ? <Check size={12} className="shrink-0 text-cyan-400" /> : <X size={12} className="shrink-0 text-slate-700" />}
                      {f}
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
        <h2 className="mb-3 font-semibold text-slate-100">Perguntas Frequentes</h2>
        <div className="divide-y divide-slate-800">
          {FAQ.map(([q, a], i) => (
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
        <p className="text-sm font-semibold text-slate-200">Precisa de ajuda?</p>
        <a href="/suporte" className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-cyan-600">
          <MessageCircle size={13} />
          Falar com Suporte
        </a>
      </div>
    </div>
  )
}
