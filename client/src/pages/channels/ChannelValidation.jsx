import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Compass, Save, RotateCcw, Loader2, Lock, Check, ArrowLeft, Plus, Trash2, RefreshCw, Link2, ExternalLink, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../auth/AuthContext'
import { useDb } from '../../lib/db'
import { isPosted } from '../../lib/videoStatus'

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

// Planos que terão acesso quando a feature for liberada ao público (Lite+).
// Por enquanto, EM TESTE: liberado SÓ para o fundador. Para abrir ao público,
// troque `allowed` por: isFounder || LITE_PLANS.includes(user?.plan).
const LITE_PLANS = ['LITE', 'PRO', 'MASTER']

// Extrai o ID de 11 chars de um vídeo do YouTube a partir de qualquer formato
// de URL (watch?v=, youtu.be/, shorts/, embed/) ou do próprio ID colado.
function parseYtId(input) {
  if (!input) return null
  const s = String(input).trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|\/v\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

const todayKey = () => new Date().toISOString().slice(0, 10)
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'))

// Sinal do vídeo em relação aos pisos do método (execução / reavaliar / tração).
function videoSignal(views, criteria) {
  if (views == null) return null
  const comp = Number(criteria?.pisoCompetencia) || 0
  const trac = Number(criteria?.pisoTracao) || 0
  if (trac && views >= trac) return { key: 'tracao', label: 'Tração', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' }
  if (comp && views < comp) return { key: 'execucao', label: 'Rever execução', cls: 'border-red-500/40 bg-red-500/10 text-red-300' }
  return { key: 'reavaliar', label: 'Reavaliar nicho', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300' }
}

export default function ChannelValidation() {
  const { id: channelId } = useParams()
  const navigate = useNavigate()
  const db = useDb()
  const { isFounder } = useAuth()
  const allowed = isFounder // EM TESTE: só o fundador (trocar depois para liberar Lite+)
  const channel = db.get('channels', channelId)
  const pipelineVideos = db.all('videos').filter((v) => v.channelId === channelId)

  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [method, setMethod] = useState({})
  const [wsDefaults, setWsDefaults] = useState({})
  const [mode, setMode] = useState('workspace') // 'workspace' | 'channel'
  const [criteria, setCriteria] = useState({})
  const [test, setTest] = useState([]) // linhas da tabela de teste
  const [rest, setRest] = useState({}) // olhares/deadline/continuityRule/verdict preservados
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshErr, setRefreshErr] = useState('')
  const [showPicker, setShowPicker] = useState(false)

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
        setTest(Array.isArray(v.test) ? v.test : [])
        setRest({ olhares: v.olhares || {}, deadline: v.deadline || null, continuityRule: v.continuityRule || '', verdict: v.verdict || null })
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [channelId, allowed])

  const cleanCriteria = () => {
    const clean = {}
    for (const { k } of FIELDS) if (criteria[k] != null && criteria[k] !== '') clean[k] = Number(criteria[k])
    return clean
  }

  // Persiste a validação inteira (critérios do modo atual + tabela + resto).
  // Usado tanto pelo botão "Salvar critérios" quanto pelas ações da tabela.
  async function persist(nextTest = test) {
    const clean = cleanCriteria()
    if (mode === 'workspace') {
      const d = await api.validation.saveDefaults(clean)
      setWsDefaults(d.criteria || clean)
      await api.validation.save(channelId, { criteriaOverride: null, ...rest, test: nextTest })
    } else {
      await api.validation.save(channelId, { criteriaOverride: clean, ...rest, test: nextTest })
    }
  }

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

  async function saveCriteria() {
    setSaving(true)
    try {
      await persist()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      /* mantém o estado */
    } finally {
      setSaving(false)
    }
  }

  // --- Tabela de teste --------------------------------------------------------
  const inTableVideoIds = useMemo(() => new Set(test.map((r) => r.videoId).filter(Boolean)), [test])
  const target = Number(criteria?.nVideos) || 10

  async function commitTest(next) {
    setTest(next)
    try {
      await persist(next)
    } catch {
      /* offline: fica no estado local até a próxima gravação */
    }
  }

  function addFromPipeline(v) {
    const yt = parseYtId(v.youtubeUrl)
    const row = {
      id: crypto.randomUUID(),
      videoId: v.id,
      title: v.title || 'Sem título',
      youtubeUrl: v.youtubeUrl || '',
      ytId: yt,
      status: yt ? 'linked' : 'planned',
      snapshots: [],
    }
    commitTest([...test, row])
  }
  function addBlank() {
    commitTest([...test, { id: crypto.randomUUID(), videoId: null, title: 'Novo vídeo de teste', youtubeUrl: '', ytId: null, status: 'planned', snapshots: [] }])
  }
  function removeRow(id) {
    commitTest(test.filter((r) => r.id !== id))
  }
  function updateRow(id, patch) {
    commitTest(test.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function linkRow(id, url) {
    const yt = parseYtId(url)
    updateRow(id, { youtubeUrl: url, ytId: yt, status: yt ? 'linked' : 'planned' })
  }

  // Busca stats dos vídeos linkados e grava um snapshot datado (1 por dia/vídeo).
  async function refreshData(silent = false) {
    const linked = test.filter((r) => r.ytId)
    if (!linked.length) return
    if (!silent) setRefreshErr('')
    setRefreshing(true)
    try {
      const ids = [...new Set(linked.map((r) => r.ytId))]
      const { videos } = await api.youtube.videoStats(ids)
      const byId = Object.fromEntries((videos || []).map((v) => [v.id, v]))
      const day = todayKey()
      const next = test.map((r) => {
        const v = r.ytId && byId[r.ytId]
        if (!v) return r
        const snap = { d: day, views: v.views, likes: v.likes, comments: v.comments, vph: v.vph, engagement: v.engagement }
        const others = (r.snapshots || []).filter((s) => s.d !== day)
        return {
          ...r,
          title: r.videoId ? r.title : v.title || r.title,
          publishedAt: v.publishedAt || r.publishedAt,
          durationSeconds: v.durationSeconds ?? r.durationSeconds,
          snapshots: [...others, snap].sort((a, b) => (a.d < b.d ? -1 : 1)),
        }
      })
      await commitTest(next)
    } catch (e) {
      if (!silent) setRefreshErr(e?.message || 'Não foi possível atualizar. Confira suas chaves do YouTube.')
    } finally {
      setRefreshing(false)
    }
  }

  // Coleta automática ao abrir: no máx. 1x/dia (se algum vídeo linkado ainda não
  // tem snapshot de hoje). Silenciosa — sem erro na cara se faltar chave.
  const [autoRan, setAutoRan] = useState(false)
  useEffect(() => {
    if (autoRan || loading || !canEdit) return
    const day = todayKey()
    const needs = test.some((r) => r.ytId && !(r.snapshots || []).some((s) => s.d === day))
    if (needs) {
      setAutoRan(true)
      refreshData(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canEdit, test])

  const latestOf = (r) => (r.snapshots && r.snapshots.length ? r.snapshots[r.snapshots.length - 1] : null)
  const availablePipeline = pipelineVideos.filter((v) => !inTableVideoIds.has(v.id))

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <button onClick={() => navigate(`/canais/${channelId}`)} className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300">
        <ArrowLeft size={15} /> Voltar ao canal
      </button>

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
        <>
          {/* ---- Critérios ---- */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Meus critérios</h2>
                <p className="text-xs text-slate-500">Sua régua de decisão. Já vêm no método recomendado — ajuste ao seu jeito.</p>
              </div>
              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                <button onClick={() => switchMode('workspace')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'workspace' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>
                  Padrão do workspace
                </button>
                <button onClick={() => switchMode('channel')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'channel' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>
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
                <button onClick={saveCriteria} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
                  {saved ? 'Salvo' : 'Salvar critérios'}
                </button>
                <button onClick={resetMethod} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-slate-100">
                  <RotateCcw size={13} /> Voltar ao método recomendado
                </button>
              </div>
            )}
          </div>

          {/* ---- Tabela de teste ---- */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Tabela de teste</h2>
                <p className="text-xs text-slate-500">
                  Os vídeos do teste com dados reais do YouTube. Meta: <span className="text-slate-300">{test.length}/{target}</span> vídeos.
                </p>
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setShowPicker((s) => !s)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/40">
                    <Plus size={13} /> Adicionar vídeos do canal
                  </button>
                  <button onClick={() => refreshData(false)} disabled={refreshing || !test.some((r) => r.ytId)} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
                    {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Atualizar dados
                  </button>
                </div>
              )}
            </div>

            {refreshErr && <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{refreshErr}</p>}

            {/* Seletor de vídeos do pipeline */}
            {showPicker && canEdit && (
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-200">Vídeos deste canal</p>
                  <button onClick={() => setShowPicker(false)} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
                </div>
                {availablePipeline.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-slate-500">Nenhum vídeo do canal disponível para adicionar. Você pode adicionar uma linha em branco abaixo.</p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-auto">
                    {availablePipeline.map((v) => {
                      const posted = isPosted(v)
                      const linked = !!parseYtId(v.youtubeUrl)
                      return (
                        <button key={v.id} onClick={() => addFromPipeline(v)} className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-left text-xs hover:border-cyan-500/40">
                          <span className="min-w-0 flex-1 truncate text-slate-200">{v.title || 'Sem título'}</span>
                          {linked ? (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">linkado</span>
                          ) : posted ? (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">postado, sem link</span>
                          ) : (
                            <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-400">a postar</span>
                          )}
                          <Plus size={13} className="text-cyan-400" />
                        </button>
                      )
                    })}
                  </div>
                )}
                <button onClick={addBlank} className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300">
                  <Plus size={12} /> Adicionar linha em branco (linkar depois)
                </button>
              </div>
            )}

            {/* A tabela */}
            {test.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-800 py-10 text-center">
                <p className="text-sm text-slate-400">Nenhum vídeo no teste ainda.</p>
                <p className="mt-1 text-[11px] text-slate-500">Adicione vídeos do canal (postados ou a postar) e o sistema puxa as views reais.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="pb-2 pr-3 font-medium">#</th>
                      <th className="pb-2 pr-3 font-medium">Vídeo</th>
                      <th className="pb-2 pr-3 font-medium">Link</th>
                      <th className="pb-2 pr-3 text-right font-medium">Views</th>
                      <th className="pb-2 pr-3 text-right font-medium">Likes</th>
                      <th className="pb-2 pr-3 text-right font-medium">Coment.</th>
                      <th className="pb-2 pr-3 text-right font-medium">Engaj.</th>
                      <th className="pb-2 pr-3 font-medium">Sinal</th>
                      <th className="pb-2 pr-3 font-medium">Snaps</th>
                      {canEdit && <th className="pb-2 font-medium"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {test.map((r, i) => {
                      const last = latestOf(r)
                      const sig = last ? videoSignal(last.views, criteria) : null
                      return (
                        <tr key={r.id} className="border-b border-slate-800/60">
                          <td className="py-2.5 pr-3 text-slate-500">{i + 1}</td>
                          <td className="py-2.5 pr-3">
                            <span className="line-clamp-1 max-w-[220px] text-slate-200">{r.title}</span>
                            <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] ${r.ytId ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/50 text-slate-400'}`}>
                              {r.ytId ? 'Linkado' : 'A postar'}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3">
                            {canEdit ? (
                              <div className="flex items-center gap-1">
                                <Link2 size={12} className="shrink-0 text-slate-500" />
                                <input
                                  defaultValue={r.youtubeUrl || ''}
                                  onBlur={(e) => { if (e.target.value.trim() !== (r.youtubeUrl || '')) linkRow(r.id, e.target.value.trim()) }}
                                  placeholder="colar link do vídeo"
                                  className="w-40 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:border-cyan-500 focus:outline-none"
                                />
                              </div>
                            ) : r.youtubeUrl ? (
                              <a href={r.youtubeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300">abrir <ExternalLink size={11} /></a>
                            ) : <span className="text-[11px] text-slate-600">—</span>}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-semibold text-slate-100">{fmt(last?.views)}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-300">{fmt(last?.likes)}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-300">{fmt(last?.comments)}</td>
                          <td className="py-2.5 pr-3 text-right text-slate-300">{last?.engagement != null ? `${last.engagement}%` : '—'}</td>
                          <td className="py-2.5 pr-3">
                            {sig ? <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${sig.cls}`}>{sig.label}</span> : <span className="text-[11px] text-slate-600">sem dados</span>}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-500">{r.snapshots?.length || 0}</td>
                          {canEdit && (
                            <td className="py-2.5 text-right">
                              <button onClick={() => removeRow(r.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-600">
              <strong className="text-slate-500">Como funciona:</strong> os dados vêm da YouTube Data API com as suas chaves (BYOK), então a coleta acontece quando você abre esta tela ou clica em <em>Atualizar dados</em> — no máximo um snapshot por dia por vídeo. Vídeos ainda não postados entram como “a postar”; assim que forem ao ar, cole o link e eles passam a ser acompanhados. O <em>Sinal</em> compara as views com os seus pisos de competência e tração.
            </p>
          </div>

          <p className="text-[11px] text-slate-600">Em breve: os 4 olhares (pré-análise) e o veredito automático a partir dos seus critérios.</p>
        </>
      )}
    </div>
  )
}
