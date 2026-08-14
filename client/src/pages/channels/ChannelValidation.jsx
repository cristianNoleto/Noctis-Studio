import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Compass, Save, RotateCcw, Loader2, Lock, Check, ArrowLeft } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { useDb } from '../../lib/db'

// Campos de critério (o "método"). Rótulo + porquê educativo. v1 em PT — i18n
// completo entra no passo de polimento.
const FIELDS = [
  { k: 'nVideos', label: 'Vídeos de teste', why: 'Máximo de vídeos antes de bater o martelo. Não aumente sem novo veredito.', unit: 'vídeos' },
  { k: 'pisoCompetencia', label: 'Piso de competência', why: 'Abaixo disso de forma consistente: o problema é execução, não o nicho.', unit: 'views' },
  { k: 'pisoTracao', label: 'Piso de tração', why: 'Um vídeo passando disso organicamente = o nicho te puxa.', unit: 'views' },
  { k: 'razaoMin', label: 'Razão mínima dos players', why: 'Média de views ÷ inscritos dos canais fortes. Acima disso, o algoritmo empurra pra fora da base.', unit: 'views/inscrito', step: 0.1 },
  { k: 'portaSubs', label: 'Porta aberta — inscritos', why: 'Canal pequeno alcançando muita gente = porta aberta pra canal novo.', unit: 'inscritos' },
  { k: 'portaViews', label: 'Porta aberta — views', why: 'Views que um canal pequeno precisa bater pra sinalizar porta aberta.', unit: 'views' },
  { k: 'demandaDiasMin', label: 'Demanda — janela (mín.)', why: 'Início da janela pra procurar um vídeo recente que rompeu a base.', unit: 'dias' },
  { k: 'demandaDiasMax', label: 'Demanda — janela (máx.)', why: 'Fim da janela de demanda viva.', unit: 'dias' },
]

const LITE_PLANS = ['LITE', 'PRO', 'MASTER']

export default function ChannelValidation() {
  const { id: channelId } = useParams()
  const navigate = useNavigate()
  const db = useDb()
  const { user, isFounder } = useAuth()
  const allowed = isFounder || LITE_PLANS.includes(user?.plan)
  const channel = db.get('channels', channelId)

  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [method, setMethod] = useState({})
  const [wsDefaults, setWsDefaults] = useState({})
  const [mode, setMode] = useState('workspace') // 'workspace' | 'channel'
  const [criteria, setCriteria] = useState({})
  const [rest, setRest] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!allowed) {
      setLoading(false)
      return
    }
    let alive = true
    api.validation
      .get(channelId)
      .then((r) => {
        if (!alive) return
        setMethod(r.method || {})
        setWsDefaults(r.workspaceDefaults || {})
        setCanEdit(!!r.canEdit)
        const v = r.validation || {}
        setMode(v.usesOverride ? 'channel' : 'workspace')
        setCriteria(v.criteria || r.workspaceDefaults || {})
        setRest({ olhares: v.olhares || {}, test: v.test || [], deadline: v.deadline || null, continuityRule: v.continuityRule || '', verdict: v.verdict || null })
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [channelId, allowed])

  function setField(k, val) {
    setCriteria((c) => ({ ...c, [k]: val }))
    setSaved(false)
  }
  function switchMode(m) {
    setMode(m)
    setSaved(false)
    if (m === 'workspace') setCriteria(wsDefaults)
  }
  function resetMethod() {
    setCriteria(method)
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const clean = {}
      for (const { k } of FIELDS) if (criteria[k] != null && criteria[k] !== '') clean[k] = Number(criteria[k])
      if (mode === 'workspace') {
        const d = await api.validation.saveDefaults(clean)
        setWsDefaults(d.criteria || clean)
        await api.validation.save(channelId, { criteriaOverride: null, ...rest })
      } else {
        await api.validation.save(channelId, { criteriaOverride: clean, ...rest })
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      /* mantém o estado */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      {/* Navegação superior (igual às outras páginas) */}
      <button onClick={() => navigate(`/canais/${channelId}`)} className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300">
        <ArrowLeft size={15} /> Voltar ao canal
      </button>

      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
          <Compass size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Validação do canal</h1>
          <p className="text-sm text-slate-500">{channel?.name || 'Decida com número e prazo quando começar, seguir ou parar.'}</p>
        </div>
      </div>

      {!allowed ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <Lock size={22} />
          </div>
          <h2 className="text-base font-bold text-slate-100">Disponível no plano Lite ou superior</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            A Validação te ajuda a decidir com critério e prazo se vale começar, seguir ou parar um canal — sem chutar pelo medo.
          </p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-100">Meus critérios</h2>
              <p className="text-xs text-slate-500">Sua régua de decisão. Já vêm no método recomendado — ajuste ao seu jeito.</p>
            </div>
            {/* Modo dos critérios */}
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
              <button
                onClick={() => switchMode('workspace')}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'workspace' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Padrão do workspace
              </button>
              <button
                onClick={() => switchMode('channel')}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'channel' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Só deste canal
              </button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {mode === 'workspace'
              ? 'Estes critérios valem para todos os canais que usam o padrão. Editar aqui muda o padrão do seu workspace.'
              : 'Critérios exclusivos deste canal (override). Não afetam os outros canais.'}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {FIELDS.map(({ k, label, why, unit, step }) => (
              <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                <label className="block text-xs font-semibold text-slate-200">{label}</label>
                <p className="mb-2.5 mt-0.5 text-[11px] leading-snug text-slate-500">{why}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step={step || 1}
                    value={criteria[k] ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => setField(k, e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-60"
                  />
                  <span className="whitespace-nowrap text-[10px] text-slate-500">{unit}</span>
                </div>
              </div>
            ))}
          </div>

          {canEdit && (
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
                {saved ? 'Salvo' : 'Salvar critérios'}
              </button>
              <button onClick={resetMethod} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100">
                <RotateCcw size={13} /> Voltar ao método recomendado
              </button>
            </div>
          )}

          <p className="mt-6 border-t border-slate-800 pt-4 text-[11px] text-slate-600">
            Em breve nesta tela: os 4 olhares (pré-análise), a tabela de teste com os vídeos reais do canal e o veredito automático.
          </p>
        </div>
      )}
    </div>
  )
}
