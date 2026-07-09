import { useState } from 'react'
import { Search, Loader2, Compass, Heart, ExternalLink, TrendingUp } from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, btnPrimary, EmptyState, formatCompact } from '../components/ui'
import { AddReferenceModal } from './References'

// Badges de tendência: classificações calculadas por faixas sobre métricas
// reais (não vêm prontas da API).
const TREND_BADGES = [
  { key: 'exploding', label: '🔥 Explodindo Agora', test: (c) => c.engagement >= 8 },
  { key: 'rising', label: '🚀 Subindo Rápido', test: (c) => c.engagement >= 5 },
  { key: 'traction', label: '⚡ Alta Tração', test: (c) => c.avgViews != null && c.subscribers > 0 && c.avgViews / c.subscribers >= 0.5 },
  { key: 'potential', label: '💎 Potencial Forte', test: (c) => c.avgViews >= 100_000 },
  { key: 'recent', label: '📈 Tração Recente', test: (c) => Date.now() - new Date(c.publishedAt).getTime() < 365 * 24 * 3600_000 },
  { key: 'smallbig', label: '👀 Poucos Inscritos, Muitas Views', test: (c) => c.subscribers < 100_000 && c.avgViews > c.subscribers },
  { key: 'new', label: '🌱 Canais Novos', test: (c) => Date.now() - new Date(c.publishedAt).getTime() < 180 * 24 * 3600_000 },
]

export default function NicheFinder() {
  const db = useDb()
  const [query, setQuery] = useState('')
  const [minSubs, setMinSubs] = useState('')
  const [maxSubs, setMaxSubs] = useState('')
  const [language, setLanguage] = useState('')
  const [activeBadge, setActiveBadge] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [saveRef, setSaveRef] = useState(null)

  const folders = db.all('referenceFolders')

  async function search(e) {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      const { results } = await api.youtube.searchChannels({ q: query.trim(), minSubs, maxSubs, language })
      setResults(results)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const filtered = (results || []).filter((c) => {
    if (!activeBadge) return true
    const badge = TREND_BADGES.find((b) => b.key === activeBadge)
    return badge?.test(c)
  })

  function badgesFor(c) {
    return TREND_BADGES.filter((b) => b.test(c)).slice(0, 2)
  }

  // Salvar referência: com pasta existente abre o modal; sem pasta, cria uma
  // pasta padrão e salva direto.
  function handleSaveRef(c) {
    if (folders.length > 0) {
      setSaveRef(c)
      return
    }
    const folder = db.insert('referenceFolders', { name: 'Descobertas do Niche Finder', channelId: null })
    db.insert('referenceChannels', {
      folderId: folder.id,
      channelId: null,
      youtubeUrl: `https://youtube.com/channel/${c.id}`,
      youtubeChannelId: c.id,
      cachedStats: c,
      niche: '',
      notes: '',
    })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Niche Finder</h1>
        <p className="mt-1 text-sm text-slate-500">Encontre nichos validados e canais que estão bombando, com métricas reais do YouTube.</p>
      </div>

      {/* Busca + filtros avançados */}
      <form onSubmit={search} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className={`${inputCls} !pl-9`}
              placeholder="Busque um nicho, tema ou formato (ex: mistérios não resolvidos)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="submit" className={`${btnPrimary} flex shrink-0 items-center gap-2`} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Buscar
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input className={inputCls} type="number" placeholder="Inscritos mín." value={minSubs} onChange={(e) => setMinSubs(e.target.value)} />
          <input className={inputCls} type="number" placeholder="Inscritos máx." value={maxSubs} onChange={(e) => setMaxSubs(e.target.value)} />
          <select className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="">Qualquer idioma</option>
            <option value="pt">Português</option>
            <option value="en">Inglês</option>
            <option value="es">Espanhol</option>
          </select>
        </div>
      </form>

      {/* Pílulas de tendência */}
      <div className="flex flex-wrap gap-1.5">
        {TREND_BADGES.map((b) => (
          <button
            key={b.key}
            onClick={() => setActiveBadge(activeBadge === b.key ? null : b.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              activeBadge === b.key ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {results === null && !loading && !error && (
        <EmptyState icon={Compass} title="Busque um nicho para começar" description="Ex: 'histórias de guerra', 'mistérios', 'curiosidades espaciais'. Configure suas chaves da YouTube API em Perfil → APIs." />
      )}

      {loading && (
        <div className="flex flex-col items-center py-16">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
          <p className="mt-3 text-sm text-slate-500">Buscando canais e calculando métricas...</p>
        </div>
      )}

      {results !== null && !loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-colors hover:border-cyan-500/40">
              <div className="flex items-center gap-3">
                {c.avatar && <img src={c.avatar} alt="" className="h-11 w-11 rounded-full" referrerPolicy="no-referrer" />}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-100">{c.title}</p>
                  <p className="text-xs text-slate-500">{formatCompact(c.subscribers)} inscritos</p>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {badgesFor(c).map((b) => (
                  <span key={b.key} className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-400">
                    {b.label}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MetricBox label="VIEWS MÉDIAS/VÍDEO" value={c.avgViews != null ? formatCompact(c.avgViews) : 'Coletando...'} />
                <MetricBox label="ENGAJAMENTO" value={c.engagement != null ? `${c.engagement}%` : 'Coletando...'} />
              </div>
              <p className="mt-2 text-[10px] text-slate-600">Crescimento mensal requer 30 dias de acompanhamento — exibindo métricas dos últimos vídeos.</p>
              <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
                <button onClick={() => handleSaveRef(c)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-800 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700">
                  <Heart size={13} />
                  Salvar Referência
                </button>
                <a
                  href={`https://youtube.com/channel/${c.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-500/10 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                >
                  <ExternalLink size={13} />
                  Canal
                </a>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full">
              <EmptyState icon={TrendingUp} title="Nenhum canal com esse filtro" description="Tente outra badge de tendência ou ajuste os filtros de inscritos." />
            </div>
          )}
        </div>
      )}

      {saveRef && (
        <AddReferenceModal open onClose={() => setSaveRef(null)} folder={folders[0]} presetUrl={`https://youtube.com/channel/${saveRef.id}`} />
      )}
    </div>
  )
}

function MetricBox({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-950 px-3 py-2 text-center">
      <p className="text-sm font-bold text-slate-100">{value}</p>
      <p className="mt-0.5 text-[9px] font-semibold tracking-wider text-slate-600">{label}</p>
    </div>
  )
}
