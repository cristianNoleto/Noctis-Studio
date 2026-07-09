import { useState } from 'react'
import { Search, Loader2, TrendingUp, Bookmark, X, SlidersHorizontal, BarChart3, Target, Lightbulb, Trash2, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, formatCompact } from '../components/ui'
import { Field } from './channels/ChannelsList'

const PERIODS = [
  ['', 'Qualquer data'],
  ['24h', 'Últimas 24 horas'],
  ['7d', 'Últimos 7 dias'],
  ['30d', 'Últimos 30 dias'],
]

const initialFilters = { q: '', period: '', durMinSec: 300, after: '', before: '', minViews: '' }

export default function ViralVideos() {
  const db = useDb()
  const [filters, setFilters] = useState(initialFilters)
  const [tab, setTab] = useState('search')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)

  const saved = db.all('savedViralVideos')

  function set(k, v) {
    setFilters((f) => ({ ...f, [k]: v }))
  }

  async function search(e) {
    e?.preventDefault()
    if (!filters.q.trim()) return
    setTab('search')
    setLoading(true)
    setError('')
    try {
      const { results } = await api.youtube.viralVideos({
        q: filters.q.trim(),
        period: filters.period,
        durMinSec: filters.durMinSec || '',
        after: filters.after,
        before: filters.before,
        minViews: filters.minViews,
      })
      setResults(results)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
          <TrendingUp size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Vídeos Virais</h1>
          <p className="text-sm text-slate-500">
            Busca avançada com filtros de duração, data de publicação e métricas. Configure a duração mínima para controlar o tipo de conteúdo.
          </p>
        </div>
      </div>

      {/* Filtros de busca */}
      <form onSubmit={search} className="rounded-xl border border-t-2 border-slate-800 border-t-cyan-500/60 bg-slate-900/40 p-5">
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <SlidersHorizontal size={15} className="text-cyan-400" />
          Filtros de Busca
        </p>

        <Field label="PALAVRAS-CHAVE PARA BUSCA *">
          <input
            className={inputCls}
            required
            placeholder="Ex: como fazer bolo, programação python..."
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
          />
        </Field>

        <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3.5 py-2.5 text-xs text-slate-400">
          💡 <b className="text-slate-300">Dica:</b> pesquise usando palavras-chave no idioma dos vídeos que deseja encontrar (Ex: "how to cook" para
          inglês, "como cozinhar" para português)
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Field label="PUBLICADO HÁ">
            <select className={inputCls} value={filters.period} onChange={(e) => set('period', e.target.value)}>
              {PERIODS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="DURAÇÃO MÍNIMA (SEG)">
            <input className={inputCls} type="number" min="0" value={filters.durMinSec} onChange={(e) => set('durMinSec', e.target.value)} />
          </Field>
          <Field label="PUBLICADO APÓS">
            <input className={inputCls} type="date" value={filters.after} onChange={(e) => set('after', e.target.value)} />
          </Field>
          <Field label="PUBLICADO ANTES">
            <input className={inputCls} type="date" value={filters.before} onChange={(e) => set('before', e.target.value)} />
          </Field>
          <Field label="VISUALIZAÇÕES MÍNIMAS">
            <input className={inputCls} type="number" min="0" placeholder="Ex: 10000" value={filters.minViews} onChange={(e) => set('minViews', e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Buscar Vídeos →
          </button>
          <button
            type="button"
            onClick={() => {
              setFilters(initialFilters)
              setResults(null)
              setError('')
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
          >
            <X size={14} />
            Limpar Filtros
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3.5 py-2.5 text-xs text-slate-400">
          <p>
            <TrendingUp size={12} className="mr-1.5 inline text-cyan-400" />
            <b className="text-cyan-300">Busca inteligente:</b> vídeos com mais visualizações primeiro (máx: 25)
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            Engajamento = views do vídeo ÷ inscritos do canal · quanto maior, mais desproporcional (viral) é o alcance 🔥
          </p>
        </div>
      </form>

      {/* Abas */}
      <div className="flex gap-1 border-b border-slate-800">
        <TabBtn active={tab === 'search'} onClick={() => setTab('search')} icon={<Search size={13} />} label="Buscar Vídeos" />
        <TabBtn active={tab === 'saved'} onClick={() => setTab('saved')} icon={<Bookmark size={13} />} label={`Vídeos Salvos (${saved.length})`} />
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {tab === 'search' && (
        <>
          {loading && (
            <div className="flex flex-col items-center py-16">
              <Loader2 size={28} className="animate-spin text-cyan-400" />
              <p className="mt-3 text-sm text-slate-500">Calculando VPH e engajamento...</p>
            </div>
          )}

          {!loading && results === null && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-6 py-16 text-center">
              <div className="text-5xl">🎯</div>
              <p className="mt-5 text-lg font-bold text-slate-100">Pronto para descobrir vídeos virais?</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
                Use a busca acima para encontrar oportunidades de conteúdo, analisar concorrentes ou identificar tendências no seu nicho
              </p>
              <div className="mx-auto mt-8 flex w-fit gap-8 rounded-xl border border-slate-800 bg-slate-950 px-8 py-4">
                <MiniFeature icon={<Search size={18} className="text-cyan-400" />} label="Busque por nicho" />
                <MiniFeature icon={<BarChart3 size={18} className="text-emerald-400" />} label="Analise métricas" />
                <MiniFeature icon={<Target size={18} className="text-red-400" />} label="Encontre oportunidades" />
              </div>
            </div>
          )}

          {!loading && results !== null && <ResultsGrid videos={results} />}
        </>
      )}

      {tab === 'saved' &&
        (saved.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 px-6 py-16 text-center">
            <Bookmark size={26} className="mx-auto text-slate-600" />
            <p className="mt-3 text-sm text-slate-500">Nenhum vídeo salvo ainda — use o botão "Salvar" nos resultados da busca.</p>
          </div>
        ) : (
          <ResultsGrid videos={saved.map((s) => s.video)} />
        ))}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active ? 'border-cyan-500 text-cyan-300' : 'border-transparent text-slate-500 hover:text-slate-300'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function MiniFeature({ icon, label }) {
  return (
    <div className="flex w-24 flex-col items-center gap-2 text-center">
      {icon}
      <span className="text-[10px] leading-tight text-slate-500">{label}</span>
    </div>
  )
}

function ResultsGrid({ videos }) {
  const db = useDb()
  const navigate = useNavigate()
  const saved = db.all('savedViralVideos')

  function toggleSave(video) {
    const existing = saved.find((s) => s.video.id === video.id)
    if (existing) db.remove('savedViralVideos', existing.id)
    else db.insert('savedViralVideos', { video })
  }

  function engagementColor(e) {
    if (e == null) return 'text-slate-500 border-slate-700'
    if (e >= 10) return 'text-green-400 border-green-500/50'
    if (e >= 3) return 'text-amber-400 border-amber-500/50'
    return 'text-slate-400 border-slate-600'
  }

  function fmtDuration(s) {
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  if (videos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 px-6 py-14 text-center">
        <Lightbulb size={24} className="mx-auto text-slate-600" />
        <p className="mt-3 text-sm text-slate-500">Nada encontrado — ajuste os filtros ou tente outro termo.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {videos.map((v) => {
        const isSaved = saved.some((s) => s.video.id === v.id)
        return (
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
                  title="Views do vídeo ÷ inscritos do canal"
                  className={`ml-auto flex h-10 w-10 items-center justify-center rounded-full border-2 text-[10px] font-bold ${engagementColor(v.engagement)}`}
                >
                  {v.engagement != null ? `${v.engagement}x` : '—'}
                </span>
              </div>
              <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
                <button
                  onClick={() => toggleSave(v)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors ${
                    isSaved ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {isSaved ? <Trash2 size={13} /> : <Bookmark size={13} />}
                  {isSaved ? 'Remover' : 'Salvar'}
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
        )
      })}
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
