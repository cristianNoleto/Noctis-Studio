import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, Loader2, GitBranch, Dna, Lightbulb, Layers, Globe2, Trash2, Star } from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, btnPrimary, Drawer, formatCompact } from '../components/ui'

const BLOCKS = [
  { key: 'dna', label: 'DNA do Canal', color: '#38bdf8', Icon: Dna, angle: -45 },
  { key: 'ideas', label: 'Mar de Ideias', color: '#facc15', Icon: Lightbulb, angle: 45 },
  { key: 'doubling', label: 'Dobra de Nicho', color: '#4ade80', Icon: Layers, angle: 135 },
  { key: 'market', label: 'Adaptação de Mercado', color: '#f87171', Icon: Globe2, angle: -135 },
]

export default function NicheDoubling() {
  const db = useDb()
  const [params] = useSearchParams()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null) // análise ativa
  const [selectedBlock, setSelectedBlock] = useState(null)
  const [detail, setDetail] = useState(null) // sub-item aberto na gaveta

  const history = [...db.all('nicheAnalyses')].sort((a, b) => b.createdAt - a.createdAt)

  // Deep-link: /dobra-de-nicho?channel=UC...
  useEffect(() => {
    const ch = params.get('channel')
    if (ch && !current && !loading) analyze(ch)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function analyze(input) {
    setLoading(true)
    setError('')
    setSelectedBlock(null)
    try {
      setStage('Buscando canal semente...')
      const channel = await api.youtube.lookupChannel(input)

      // Cache: reusa análise existente do mesmo canal
      const cached = history.find((h) => h.sourceChannelId === channel.id)
      if (cached) {
        setCurrent(cached)
        setLoading(false)
        return
      }

      setStage('Coletando vídeos de maior desempenho...')
      const { results: topVideos } = await api.youtube.topVideos(channel.id)

      setStage('Gerando análise com IA (Gemini)...')
      const result = await api.ai.nicheDoubling({ channel, topVideos })

      const saved = db.insert('nicheAnalyses', {
        sourceChannelId: channel.id,
        channel,
        result,
      })
      setCurrent(saved)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
      setStage('')
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dobra de Nicho</h1>
        <p className="mt-1 text-sm text-slate-500">
          Analise um canal semente e descubra como replicar o formato em novos nichos e mercados.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (query.trim()) analyze(query.trim())
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={`${inputCls} !pl-9`} placeholder="URL ou @handle do canal semente" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="submit" className={`${btnPrimary} flex shrink-0 items-center gap-2`} disabled={loading}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <GitBranch size={15} />}
          Analisar
        </button>
      </form>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {loading && (
        <div className="flex flex-col items-center py-16">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
          <p className="mt-3 text-sm text-slate-500">{stage}</p>
        </div>
      )}

      {/* Histórico de análises */}
      {!current && !loading && history.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500">ANÁLISES SALVAS</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 transition-colors hover:border-cyan-500/40">
                <button onClick={() => setCurrent(h)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  {h.channel?.avatar && <img src={h.channel.avatar} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{h.channel?.title}</p>
                    <p className="text-[11px] text-slate-500">{formatCompact(h.channel?.subscribers)} inscritos</p>
                  </div>
                </button>
                <button onClick={() => db.remove('nicheAnalyses', h.id)} className="text-slate-600 hover:text-red-400" title="Excluir análise">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!current && !loading && !error && history.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 py-16 text-center">
          <GitBranch size={30} className="mx-auto text-cyan-400" />
          <p className="mt-4 font-semibold text-slate-200">Cole a URL de um canal que está bombando</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            A IA disseca o DNA do canal em 4 dimensões e sugere como você replica o sucesso. Requer chaves do YouTube + Gemini em Perfil → APIs.
          </p>
        </div>
      )}

      {/* Mapa radial */}
      {current && !loading && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrent(null)} className="text-xs text-slate-500 hover:text-slate-300">
              ← Voltar ao histórico
            </button>
            <p className="text-[11px] text-slate-600">
              ⚠️ Scores de sucesso e dificuldade são <b>estimativas geradas por IA</b> a partir de padrões — não métricas garantidas.
            </p>
          </div>
          <RadialMap
            analysis={current}
            selectedBlock={selectedBlock}
            onSelectBlock={(k) => setSelectedBlock(selectedBlock === k ? null : k)}
            onSelectItem={(block, item) => setDetail({ block, item })}
          />
        </>
      )}

      <DetailDrawer detail={detail} onClose={() => setDetail(null)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mapa mental radial (SVG + Framer Motion)
// ---------------------------------------------------------------------------
function RadialMap({ analysis, selectedBlock, onSelectBlock, onSelectItem }) {
  const W = 1100
  const H = 640
  const cx = W / 2
  const cy = H / 2
  const orbitR = 210

  function pos(angleDeg, r) {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="relative mx-auto" style={{ width: W, height: H }}>
        {/* Linhas */}
        <svg width={W} height={H} className="absolute inset-0">
          {BLOCKS.map((b) => {
            const p = pos(b.angle, orbitR)
            return (
              <motion.line
                key={b.key}
                x1={cx}
                y1={cy}
                x2={p.x}
                y2={p.y}
                stroke={b.color}
                strokeWidth="1.5"
                strokeDasharray="6 6"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.6 }}
                transition={{ duration: 0.8 }}
              />
            )
          })}
          {/* Linhas dos sub-nós do bloco selecionado */}
          {BLOCKS.filter((b) => b.key === selectedBlock).map((b) => {
            const origin = pos(b.angle, orbitR)
            const items = analysis.result?.[b.key] || []
            return items.map((_, i) => {
              const spread = 70
              const subAngle = b.angle - spread / 2 + (spread / Math.max(1, items.length - 1)) * i
              const p = pos(subAngle, orbitR + 150)
              return (
                <motion.line
                  key={`${b.key}-${i}`}
                  x1={origin.x}
                  y1={origin.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={b.color}
                  strokeWidth="1"
                  strokeDasharray="4 5"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1, opacity: 0.5 }}
                  transition={{ duration: 0.4 }}
                />
              )
            })
          })}
        </svg>

        {/* Nó central */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute z-10 flex flex-col items-center"
          style={{ left: cx, top: cy, transform: 'translate(-50%, -50%)' }}
        >
          <div className="-translate-x-1/2 -translate-y-1/2">
            <div className="flex flex-col items-center">
              {analysis.channel?.avatar ? (
                <img src={analysis.channel.avatar} alt="" className="h-20 w-20 rounded-full border-2 border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.4)]" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-cyan-400 bg-slate-800 text-2xl font-bold text-slate-200">
                  {analysis.channel?.title?.charAt(0)}
                </div>
              )}
              <p className="mt-2 max-w-[160px] truncate text-center text-sm font-bold text-slate-100">{analysis.channel?.title}</p>
              <p className="text-[11px] text-slate-500">{formatCompact(analysis.channel?.subscribers)} inscritos</p>
            </div>
          </div>
        </motion.div>

        {/* Nós orbitais */}
        {BLOCKS.map((b, idx) => {
          const p = pos(b.angle, orbitR)
          const count = (analysis.result?.[b.key] || []).length
          const active = selectedBlock === b.key
          return (
            <motion.button
              key={b.key}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15 * idx }}
              onClick={() => onSelectBlock(b.key)}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: p.x, top: p.y }}
            >
              <div
                className={`flex w-40 flex-col items-center rounded-xl border-2 bg-slate-950 px-3 py-3 transition-shadow ${active ? 'shadow-[0_0_25px_rgba(255,255,255,0.08)]' : ''}`}
                style={{ borderColor: b.color }}
              >
                <b.Icon size={20} style={{ color: b.color }} />
                <p className="mt-1.5 text-center text-xs font-bold text-slate-100">{b.label}</p>
                <span className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${b.color}22`, color: b.color }}>
                  {count} ideias
                </span>
              </div>
            </motion.button>
          )
        })}

        {/* Sub-nós */}
        <AnimatePresence>
          {BLOCKS.filter((b) => b.key === selectedBlock).map((b) => {
            const items = analysis.result?.[b.key] || []
            return items.map((item, i) => {
              const spread = 70
              const subAngle = b.angle - spread / 2 + (spread / Math.max(1, items.length - 1)) * i
              const p = pos(subAngle, orbitR + 150)
              return (
                <motion.button
                  key={`${b.key}-${i}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ delay: 0.05 * i }}
                  onClick={() => onSelectItem(b, item)}
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: p.x, top: p.y }}
                >
                  <div className="w-44 rounded-lg border bg-slate-950 p-2.5 text-left transition-colors hover:bg-slate-900" style={{ borderColor: `${b.color}66` }}>
                    <p className="line-clamp-2 text-[11px] font-semibold leading-snug text-slate-200">{item.title}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="flex items-center gap-0.5 text-[10px] font-bold" style={{ color: b.color }}>
                        <Star size={9} />
                        {item.successScore}%
                      </span>
                      <span className="text-[9px] text-slate-500">{item.difficulty}</span>
                    </div>
                  </div>
                </motion.button>
              )
            })
          })}
        </AnimatePresence>
      </div>
      <p className="border-t border-slate-800 px-4 py-2.5 text-center text-[11px] text-slate-600">
        Clique em um nó colorido para expandir as ideias · clique numa ideia para ver o plano de aplicação completo
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gaveta de detalhe do sub-nó
// ---------------------------------------------------------------------------
function DetailDrawer({ detail, onClose }) {
  const [tab, setTab] = useState('apply')
  if (!detail) return null
  const { block, item } = detail

  const difficultyCls = { Fácil: 'bg-green-500/15 text-green-400', Média: 'bg-amber-500/15 text-amber-400', Difícil: 'bg-red-500/15 text-red-400' }[item.difficulty] || 'bg-slate-800 text-slate-400'

  return (
    <Drawer open onClose={onClose} title={item.title}>
      <div className="space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${block.color}22`, color: block.color }}>
            {block.label}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-200">
            <Star size={11} style={{ color: block.color }} />
            Sucesso estimado: {item.successScore}%
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${difficultyCls}`}>Palavra-chave: {item.difficulty}</span>
        </div>

        <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300/80">
          Estimativas geradas por IA a partir de padrões do canal semente — valide antes de investir na produção.
        </p>

        <div className="flex gap-1 border-b border-slate-800">
          {[
            ['apply', 'Como aplicar na prática'],
            ['preserve', 'O que preservar / O que muda'],
            ['titles', 'Títulos Recomendados'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                tab === key ? 'border-cyan-500 text-cyan-300' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'apply' && <p className="text-sm leading-relaxed text-slate-300">{item.howToApply}</p>}
        {tab === 'preserve' && <p className="text-sm leading-relaxed text-slate-300">{item.preserveVsChange}</p>}
        {tab === 'titles' && (
          <ul className="space-y-2">
            {(item.recommendedTitles || []).map((t, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm text-slate-200">
                <span className="text-[10px] font-bold text-slate-600">{i + 1}</span>
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  )
}
