import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Plus,
  Loader2,
  Compass,
  Heart,
  Flame,
  TrendingUp,
  Zap,
  Gem,
  Activity,
  Eye,
  Sprout,
  LayoutGrid,
  SlidersHorizontal,
  Calendar,
  Clock,
} from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, EmptyState, formatCompact } from '../components/ui'

// Consulta padrão usada para pré-carregar a página na primeira visita.
const DEFAULT_QUERY = 'curiosidades documentário histórias'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h — depois disso o auto-load renova

// Badges de tendência: classificações calculadas por faixas sobre métricas
// reais (não vêm prontas da API).
const TREND_TABS = [
  { key: 'all', label: 'Todos', Icon: LayoutGrid, desc: 'Todos os canais carregados', test: () => true },
  { key: 'exploding', label: 'Explodindo Agora', Icon: Flame, desc: 'Postou há menos de 15 dias e faz mais de 100 mil views por vídeo', test: (c) => (c.lastUploadDaysAgo ?? 99) <= 15 && c.avgViews >= 100_000 },
  { key: 'rising', label: 'Subindo Rápido', Icon: TrendingUp, desc: 'Views médias acima de 50% da base de inscritos', test: (c) => c.avgViews != null && c.subscribers > 0 && c.avgViews / c.subscribers >= 0.5 },
  { key: 'traction', label: 'Alta Tração', Icon: Zap, desc: 'Mais de 500 mil views por mês na cadência atual', test: (c) => (c.viewsPerMonth ?? 0) >= 500_000 },
  { key: 'potential', label: 'Potencial Forte', Icon: Gem, desc: 'Média acima de 100 mil views por vídeo', test: (c) => (c.avgViews ?? 0) >= 100_000 },
  { key: 'recent', label: 'Tração Recente', Icon: Activity, desc: 'Canal criado há menos de 1 ano', test: (c) => Date.now() - new Date(c.publishedAt).getTime() < 365 * 86_400_000 },
  { key: 'smallbig', label: 'Poucos Inscritos, Muitas Views', Icon: Eye, desc: 'Menos de 100 mil inscritos com views médias maiores que a base', test: (c) => c.subscribers < 100_000 && (c.avgViews ?? 0) > c.subscribers },
  { key: 'new', label: 'Canais Novos', Icon: Sprout, desc: 'Canal criado há menos de 6 meses', test: (c) => Date.now() - new Date(c.publishedAt).getTime() < 180 * 86_400_000 },
]

const SUB_RANGES = [
  ['', 'Inscritos'],
  ['0-10000', 'Até 10K'],
  ['10000-100000', '10K – 100K'],
  ['100000-1000000', '100K – 1M'],
  ['1000000-', '1M+'],
]

const VIEW_RANGES = [
  ['', 'Views'],
  ['0-50000', 'Até 50K/vídeo'],
  ['50000-200000', '50K – 200K/vídeo'],
  ['200000-', '200K+/vídeo'],
]

// Bandeira em imagem — emoji de bandeira não renderiza no Windows
function CountryFlag({ country }) {
  if (!country || country.length !== 2) return null
  return (
    <img
      src={`https://flagcdn.com/w40/${country.toLowerCase()}.png`}
      alt={country}
      className="absolute -right-1 -top-1 h-3 w-4 rounded-[2px] border border-slate-950 object-cover"
      loading="lazy"
    />
  )
}

function timeAgo(ts) {
  const min = Math.round((Date.now() - ts) / 60000)
  if (min < 60) return `${Math.max(1, min)}min`
  const h = Math.round(min / 60)
  if (h < 48) return `${h}h`
  return `${Math.round(h / 24)} dias`
}

export default function NicheFinder() {
  const db = useDb()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [subRange, setSubRange] = useState('')
  const [viewRange, setViewRange] = useState('')
  const [language, setLanguage] = useState('')
  const [order, setOrder] = useState('avgViews')
  const [showFavorites, setShowFavorites] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [loadingMore, setLoadingMore] = useState(false)
  const cache = db.getSetting('nicheFinderCache')
  const results = cache?.results || []
  const favorites = db.getSetting('nicheFavorites', [])
  const hasKeys = (db.getSetting('ytKeys', []) || []).some(Boolean)

  // Auto-load: a página já abre com resultados, sem precisar buscar.
  useEffect(() => {
    const stale = !cache || Date.now() - cache.ts > CACHE_TTL_MS
    if (stale && hasKeys && !loading) fetchChannels(DEFAULT_QUERY)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchChannels(q) {
    setLoading(true)
    setError('')
    try {
      const { results, nextPageToken } = await api.youtube.searchChannels({ q, language })
      db.setSetting('nicheFinderCache', { ts: Date.now(), query: q, results, nextPageToken })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // "Mostrar mais": continua paginando a mesma busca até o YouTube esgotar a listagem.
  async function loadMore() {
    if (!cache?.nextPageToken || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const { results: more, nextPageToken } = await api.youtube.searchChannels({
        q: cache.query,
        language,
        pageToken: cache.nextPageToken,
      })
      const seen = new Set(results.map((c) => c.id))
      db.setSetting('nicheFinderCache', {
        ...cache,
        results: [...results, ...more.filter((c) => !seen.has(c.id))],
        nextPageToken,
      })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  function toggleFavorite(c) {
    const exists = favorites.some((f) => f.id === c.id)
    db.setSetting('nicheFavorites', exists ? favorites.filter((f) => f.id !== c.id) : [...favorites, c])
  }

  const activeTab = TREND_TABS.find((t) => t.key === tab)
  const base = showFavorites ? favorites : results
  const text = query.trim().toLowerCase()

  let filtered = base.filter((c) => activeTab.test(c))
  if (text) filtered = filtered.filter((c) => `${c.title} ${c.description || ''}`.toLowerCase().includes(text))
  if (subRange) {
    const [min, max] = subRange.split('-')
    filtered = filtered.filter((c) => c.subscribers >= Number(min || 0) && (!max || c.subscribers <= Number(max)))
  }
  if (viewRange) {
    const [min, max] = viewRange.split('-')
    filtered = filtered.filter((c) => (c.avgViews ?? 0) >= Number(min || 0) && (!max || (c.avgViews ?? 0) <= Number(max)))
  }
  filtered = [...filtered].sort((a, b) => (b[order] ?? 0) - (a[order] ?? 0))

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <Compass size={22} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-100">Niche Finder</h1>
              {results.length > 0 && (
                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                  {results.length} canais carregados{cache?.ts ? ` · atualizado há ${timeAgo(cache.ts)}` : ''}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">Descubra nichos em crescimento no YouTube</p>
          </div>
        </div>
      </div>

      {/* Abas de tendência */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
          {TREND_TABS.map(({ key, label, Icon }) => {
            const count = (showFavorites ? favorites : results).filter((c) => TREND_TABS.find((t) => t.key === key).test(c)).length
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                  tab === key ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Icon size={13} />
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === key ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-500'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Descrição da aba + Favoritos */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{activeTab.desc}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFavorites((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
              showFavorites ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Heart size={14} className={showFavorites ? 'fill-red-400' : ''} />
            Favoritos
            <span className="rounded-full bg-slate-800 px-1.5 text-[10px]">{favorites.length}</span>
          </button>
          <button className="flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-3 text-slate-400 hover:border-slate-700" title="Filtros">
            <SlidersHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Busca + filtros dropdown */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className={`${inputCls} !pl-9`}
            placeholder="Buscar por nome, nicho, idioma... (Enter busca no YouTube)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query.trim() && fetchChannels(query.trim())}
          />
        </div>
        <select className={`${inputCls} !w-auto`} value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">Idioma</option>
          <option value="pt">Português</option>
          <option value="en">Inglês</option>
          <option value="es">Espanhol</option>
        </select>
        <select className={`${inputCls} !w-auto`} value={subRange} onChange={(e) => setSubRange(e.target.value)}>
          {SUB_RANGES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select className={`${inputCls} !w-auto`} value={viewRange} onChange={(e) => setViewRange(e.target.value)}>
          {VIEW_RANGES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select className={`${inputCls} !w-auto`} value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="avgViews">Ordenar: Views médias</option>
          <option value="subscribers">Ordenar: Inscritos</option>
          <option value="engagement">Ordenar: Engajamento</option>
          <option value="viewsPerMonth">Ordenar: Views/mês</option>
        </select>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {loading && (
        <div className="flex flex-col items-center py-16">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
          <p className="mt-3 text-sm text-slate-500">Buscando canais e calculando métricas...</p>
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <EmptyState
          icon={Compass}
          title={hasKeys ? 'Busque um nicho para começar' : 'Configure suas chaves da YouTube API'}
          description={
            hasKeys
              ? "Digite um tema na busca e pressione Enter — ex: 'histórias de guerra', 'mistérios'."
              : 'Adicione até 5 chaves em Perfil → APIs. Depois disso, esta página já abre com canais carregados automaticamente.'
          }
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {filtered.map((c) => (
            <ChannelCard
              key={c.id}
              channel={c}
              isFavorite={favorites.some((f) => f.id === c.id)}
              onToggleFavorite={() => toggleFavorite(c)}
              onOpenDoubling={() => navigate(`/dobra-de-nicho?channel=${c.id}`)}
              cacheTs={cache?.ts}
            />
          ))}
        </div>
      )}

      {!loading && results.length > 0 && filtered.length === 0 && (
        <EmptyState icon={TrendingUp} title="Nenhum canal com esses filtros" description="Troque a aba de tendência ou limpe os filtros." />
      )}

      {/* Mostrar mais (50 por página até acabar a listagem) */}
      {!loading && !showFavorites && filtered.length > 0 && cache?.nextPageToken && (
        <div className="flex justify-center pb-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-6 py-2.5 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
          >
            {loadingMore ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {loadingMore ? 'Carregando mais 50 canais...' : 'Mostrar mais'}
          </button>
        </div>
      )}
      {!loading && !showFavorites && results.length > 0 && !cache?.nextPageToken && (
        <p className="pb-4 text-center text-xs text-slate-600">Fim da listagem do YouTube para esta busca.</p>
      )}
    </div>
  )
}

function ChannelCard({ channel: c, isFavorite, onToggleFavorite, onOpenDoubling, cacheTs }) {
  const badge = TREND_TABS.slice(1).find((t) => t.test(c))

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 transition-colors hover:border-cyan-500/40">
      <div className="border-t-2 border-cyan-500/60" />
      <div className="p-3.5">
        {/* Cabeçalho do card */}
        <div className="flex items-start gap-2.5">
          <div className="relative shrink-0">
            {c.avatar ? (
              <img src={c.avatar} alt="" className="h-11 w-11 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 font-bold text-slate-300">{c.title?.charAt(0)}</div>
            )}
            <CountryFlag country={c.country} />
          </div>
          <div className="min-w-0 flex-1">
            <button onClick={onOpenDoubling} className="block max-w-full truncate text-sm font-bold text-slate-100 hover:text-cyan-300" title="Analisar na Dobra de Nicho">
              {c.title}
            </button>
            <p className="truncate text-[11px] text-slate-500">{c.description || 'Sem descrição'}</p>
            {badge && (
              <span className="mt-1 inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-400">{badge.label}</span>
            )}
          </div>
          <button onClick={onToggleFavorite} title={isFavorite ? 'Remover dos favoritos' : 'Favoritar'} className="shrink-0">
            <Heart size={16} className={isFavorite ? 'fill-red-400 text-red-400' : 'text-slate-600 hover:text-red-400'} />
          </button>
        </div>

        {/* Thumbnails dos últimos vídeos */}
        {c.recentVideos?.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {c.recentVideos.map((v) => (
              <a key={v.id} href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer" className="relative overflow-hidden rounded-md">
                <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover transition-transform hover:scale-110" loading="lazy" />
                <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-px text-[9px] font-bold text-white">{formatCompact(v.views)}</span>
              </a>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="mt-3 grid grid-cols-4 divide-x divide-slate-800 rounded-lg border border-slate-800 py-2 text-center">
          <CardStat value={formatCompact(c.subscribers)} label="INSCRITOS" />
          <CardStat value={formatCompact(c.views)} label="VIEWS" />
          <CardStat value={c.videoCount ?? '—'} label="VÍDEOS" />
          <CardStat value={c.engagement != null ? `${c.engagement}%` : '—'} label="ENGAJ." accent />
        </div>

        {/* Rodapé de cadência */}
        <div className="mt-3 space-y-1 border-t border-slate-800 pt-2.5 text-[10px] text-slate-500">
          <p className="flex items-center gap-1.5">
            <Calendar size={10} />
            {c.lastUploadDaysAgo != null ? `${c.lastUploadDaysAgo}d desde o último post` : 'cadência indisponível'}
            {c.vidsPerMonth != null && ` · ${c.vidsPerMonth} vid/mês`}
            {c.viewsPerMonth != null && ` · ${formatCompact(c.viewsPerMonth)} views/mês`}
          </p>
          <p className="flex items-center gap-1.5">
            <Clock size={10} />
            {cacheTs ? `atualizado há ${timeAgo(cacheTs)}` : 'atualizado agora'} · crescimento mensal requer 30d de acompanhamento
          </p>
        </div>
      </div>
    </div>
  )
}

function CardStat({ value, label, accent }) {
  return (
    <div className="px-1">
      <p className={`truncate text-xs font-bold ${accent ? 'text-cyan-400' : 'text-slate-100'}`}>{value}</p>
    <p className="text-[8px] font-semibold tracking-wider text-slate-600">{label}</p>
    </div>
  )
}
