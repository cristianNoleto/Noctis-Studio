import { useState } from 'react'
import { Search, Loader2, TrendingUp, Star, ExternalLink, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, btnPrimary, EmptyState, formatCompact } from '../components/ui'

const PERIODS = [
  ['24h', 'Últimas 24h'],
  ['7d', '7 dias'],
  ['30d', '30 dias'],
  ['', 'Qualquer data'],
]

export default function ViralVideos() {
  const db = useDb()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState('7d')
  const [minViews, setMinViews] = useState('')
  const [durMin, setDurMin] = useState('')
  const [durMax, setDurMax] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [savedIds, setSavedIds] = useState({})

  async function search(e) {
    e?.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { results } = await api.youtube.viralVideos({ q: query.trim(), period, minViews, durMin, durMax })
      setResults(results)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // "Salvar" cria um card automaticamente no Quadro de Ideias.
  function saveToBoard(video) {
    const columns = [...db.all('boardColumns')].sort((a, b) => a.position - b.position)
    if (!columns.length) return
    db.insert('boardCards', {
      columnId: columns[0].id,
      title: video.title,
      color: '#2f3d4b',
      position: db.all('boardCards').filter((c) => c.columnId === columns[0].id).length,
      source: 'viral_videos',
      source_ref: { videoId: video.id, channelTitle: video.channelTitle, views: video.views },
    })
    setSavedIds((s) => ({ ...s, [video.id]: true }))
  }

  function engagementColor(e) {
    if (e == null) return 'text-slate-500 border-slate-700'
    if (e >= 10) return 'text-green-400 border-green-500/50'
    if (e >= 3) return 'text-amber-400 border-amber-500/50'
    return 'text-slate-400 border-slate-600'
  }

  function fmtDuration(s) {
    const m = Math.floor(s / 60)
    const sec = String(s % 60).padStart(2, '0')
    return `${m}:${sec}`
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Vídeos Virais</h1>
        <p className="mt-1 text-sm text-slate-500">Veja o que está bombando agora — VPH e engajamento calculados de dados reais.</p>
      </div>

      <form onSubmit={search} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className={`${inputCls} !pl-9`} placeholder="Busca livre (tema, nicho, palavra-chave)" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button type="submit" className={`${btnPrimary} flex shrink-0 items-center gap-2`} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            Buscar
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input className={inputCls} type="number" placeholder="Views mínimas" value={minViews} onChange={(e) => setMinViews(e.target.value)} />
          <input className={inputCls} type="number" placeholder="Duração mín. (min)" value={durMin} onChange={(e) => setDurMin(e.target.value)} />
          <input className={inputCls} type="number" placeholder="Duração máx. (min)" value={durMax} onChange={(e) => setDurMax(e.target.value)} />
        </div>
      </form>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {results === null && !loading && !error && (
        <EmptyState icon={TrendingUp} title="Busque vídeos em alta" description="Filtre por período, duração e views mínimas. Requer chaves da YouTube API em Perfil → APIs." />
      )}

      {loading && (
        <div className="flex flex-col items-center py-16">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
          <p className="mt-3 text-sm text-slate-500">Calculando VPH e engajamento...</p>
        </div>
      )}

      {results !== null && !loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((v) => (
            <div key={v.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 transition-colors hover:border-cyan-500/40">
              <div className="relative">
                {v.thumbnail && <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />}
                <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {fmtDuration(v.durationSeconds)}
                </span>
              </div>
              <div className="p-4">
                <a
                  href={`https://youtube.com/watch?v=${v.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-2 text-sm font-semibold leading-snug text-slate-100 hover:text-cyan-300"
                >
                  {v.title}
                </a>
                <p className="mt-1 text-xs text-slate-500">
                  {v.channelTitle} · {formatCompact(v.channelSubs)} inscritos
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <MetricPill label="VIEWS" value={formatCompact(v.views)} />
                  <MetricPill label="VPH" value={formatCompact(v.vph)} />
                  <span
                    title="Views do vídeo ÷ inscritos do canal — quanto maior, mais desproporcional (viral) é o alcance"
                    className={`ml-auto flex h-10 w-10 items-center justify-center rounded-full border-2 text-[10px] font-bold ${engagementColor(v.engagement)}`}
                  >
                    {v.engagement != null ? `${v.engagement}x` : '—'}
                  </span>
                </div>
                <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
                  <button
                    onClick={() => saveToBoard(v)}
                    disabled={savedIds[v.id]}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
                      savedIds[v.id] ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    <Star size={13} className={savedIds[v.id] ? 'fill-green-400' : ''} />
                    {savedIds[v.id] ? 'Salvo no Quadro' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => navigate(`/dobra-de-nicho?channel=${v.channelId}`)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500/10 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                  >
                    <ExternalLink size={13} />
                    Canal
                  </button>
                </div>
              </div>
            </div>
          ))}
          {results.length === 0 && (
            <div className="col-span-full">
              <EmptyState icon={TrendingUp} title="Nada encontrado" description="Ajuste os filtros ou tente outro termo." />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MetricPill({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-950 px-2.5 py-1.5 text-center">
      <p className="text-xs font-bold text-slate-100">{value}</p>
      <p className="text-[9px] font-semibold tracking-wider text-slate-600">{label}</p>
    </div>
  )
}
