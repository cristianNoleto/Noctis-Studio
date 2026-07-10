import { useEffect, useRef, useState } from 'react'
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
  FolderOpen,
  SlidersHorizontal,
  Calendar,
  Clock,
  ChevronDown,
  Check,
  DollarSign,
  X,
  Save,
  Trash2,
} from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, btnPrimary, btnGhost, EmptyState, formatCompact } from '../components/ui'

// Consulta padrão usada para pré-carregar a página na primeira visita.
const DEFAULT_QUERY = 'curiosidades documentário histórias'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6h — depois disso o auto-load renova

// Idade do canal em dias (desde a criação no YouTube)
function ageDays(c) {
  return Math.max(0, Math.round((Date.now() - new Date(c.publishedAt).getTime()) / 86_400_000))
}

// Heurística de monetização (requisitos do YPP: 1.000 inscritos + horas de
// exibição — sem acesso às horas, usamos views totais como proxy).
export function isMonetized(c) {
  return c.subscribers >= 1_000 && c.views >= 100_000
}

// -----------------------------------------------------------------------------
// Badges de tendência — cada faixa cruza IDADE DO CANAL × VOLUME DE VIEWS.
// -----------------------------------------------------------------------------
const TREND_TABS = [
  { key: 'all', label: 'Todos os Resultados', Icon: LayoutGrid, desc: 'Todos os canais carregados nesta busca', test: () => true },
  {
    key: 'exploding',
    label: 'Explodindo Agora',
    Icon: Flame,
    desc: 'Menos de 15 dias de canal e mais de 100 mil views — viral imediato',
    test: (c) => ageDays(c) <= 15 && c.views >= 100_000,
  },
  {
    key: 'rising',
    label: 'Subindo Rápido',
    Icon: TrendingUp,
    desc: 'Menos de 15 dias de canal e entre 50 e 100 mil views',
    test: (c) => ageDays(c) <= 15 && c.views >= 50_000 && c.views < 100_000,
  },
  {
    key: 'traction',
    label: 'Alta Tração',
    Icon: Zap,
    desc: 'Entre 15 e 60 dias de canal e mais de 500 mil views',
    test: (c) => ageDays(c) > 15 && ageDays(c) <= 60 && c.views >= 500_000,
  },
  {
    key: 'potential',
    label: 'Potencial Forte',
    Icon: Gem,
    desc: 'Entre 15 e 60 dias de canal e entre 100 e 500 mil views',
    test: (c) => ageDays(c) > 15 && ageDays(c) <= 60 && c.views >= 100_000 && c.views < 500_000,
  },
  {
    key: 'recent',
    label: 'Tração Recente',
    Icon: Activity,
    desc: 'Entre 60 e 90 dias de canal e mais de 200 mil views',
    test: (c) => ageDays(c) > 60 && ageDays(c) <= 90 && c.views >= 200_000,
  },
  {
    key: 'smallbig',
    label: 'Poucos Inscritos, Muitas Views',
    Icon: Eye,
    desc: 'Menos de 1.000 inscritos e mais de 50 mil views — o algoritmo está empurrando',
    test: (c) => c.subscribers < 1_000 && c.views > 50_000,
  },
  {
    key: 'new',
    label: 'Canais Novos',
    Icon: Sprout,
    desc: 'Criado há menos de 30 dias e menos de 1.000 inscritos',
    test: (c) => ageDays(c) <= 30 && c.subscribers < 1_000,
  },
  {
    key: 'bycategory',
    label: 'Por Categoria',
    Icon: FolderOpen,
    desc: 'Canais agrupados pelas categorias de vídeo do YouTube',
    test: () => true,
  },
]

// Estimativa "Faceless %" — determinística por canal (nichos tipicamente sem
// rosto pesam mais; o restante vem de um hash estável do id).
const FACELESS_TOPICS = ['Música', 'Documentário', 'História', 'Educação', 'Cristão', 'Música Religiosa', 'Tecnologia', 'Militar']
export function facelessScore(c) {
  let hash = 0
  for (const ch of c.id || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const base = 20 + (hash % 36) // 20–55
  const bonus = (c.topics || []).some((t) => FACELESS_TOPICS.includes(t)) ? 15 : 0
  return Math.min(95, Math.round((base + bonus) / 5) * 5)
}

const SUB_RANGES = [
  ['', 'Inscritos'],
  ['0-1000', 'Até 1K'],
  ['1000-10000', '1K – 10K'],
  ['10000-100000', '10K – 100K'],
  ['100000-1000000', '100K – 1M'],
  ['1000000-', '1M+'],
]

// Views totais do canal — faixas do sistema original (print 3)
const VIEW_RANGES = [
  ['', 'Todos'],
  ['0-100000', '0 – 100k'],
  ['100000-1000000', '100k – 1M'],
  ['1000000-10000000', '1M – 10M'],
  ['10000000-100000000', '10M – 100M'],
  ['100000000-', '100M+'],
  ['custom', 'Personalizado'],
]

const SORT_OPTIONS = [
  ['views', 'Visualizações'],
  ['subscribers', 'Inscritos'],
  ['avgViews', 'Views médias'],
  ['videoCount', 'Vídeos'],
  ['engagement', 'Engajamento'],
  ['viewsPerMonth', 'Views/mês'],
  ['newest', 'Mais recentes'],
]

// 50 idiomas mais usados no YouTube (print 2) — código ISO p/ relevanceLanguage
// + país da bandeira (flagcdn).
const LANGUAGES = [
  ['en', 'Inglês', 'us'],
  ['pt', 'Português', 'br'],
  ['es', 'Espanhol', 'es'],
  ['de', 'Alemão', 'de'],
  ['pl', 'Polonês', 'pl'],
  ['ru', 'Russo', 'ru'],
  ['fr', 'Francês', 'fr'],
  ['it', 'Italiano', 'it'],
  ['ja', 'Japonês', 'jp'],
  ['ko', 'Coreano', 'kr'],
  ['zh', 'Chinês', 'cn'],
  ['hi', 'Hindi', 'in'],
  ['ar', 'Árabe', 'sa'],
  ['tr', 'Turco', 'tr'],
  ['nl', 'Holandês', 'nl'],
  ['sv', 'Sueco', 'se'],
  ['no', 'Norueguês', 'no'],
  ['da', 'Dinamarquês', 'dk'],
  ['fi', 'Finlandês', 'fi'],
  ['el', 'Grego', 'gr'],
  ['cs', 'Tcheco', 'cz'],
  ['hu', 'Húngaro', 'hu'],
  ['ro', 'Romeno', 'ro'],
  ['uk', 'Ucraniano', 'ua'],
  ['bg', 'Búlgaro', 'bg'],
  ['sr', 'Sérvio', 'rs'],
  ['hr', 'Croata', 'hr'],
  ['sk', 'Eslovaco', 'sk'],
  ['sl', 'Esloveno', 'si'],
  ['th', 'Tailandês', 'th'],
  ['vi', 'Vietnamita', 'vn'],
  ['id', 'Indonésio', 'id'],
  ['ms', 'Malaio', 'my'],
  ['tl', 'Filipino', 'ph'],
  ['he', 'Hebraico', 'il'],
  ['fa', 'Persa', 'ir'],
  ['ur', 'Urdu', 'pk'],
  ['bn', 'Bengali', 'bd'],
  ['ta', 'Tâmil', 'in'],
  ['te', 'Telugo', 'in'],
  ['mr', 'Marata', 'in'],
  ['pa', 'Punjabi', 'in'],
  ['sw', 'Suaíli', 'ke'],
  ['af', 'Africâner', 'za'],
  ['et', 'Estoniano', 'ee'],
  ['lv', 'Letão', 'lv'],
  ['lt', 'Lituano', 'lt'],
  ['is', 'Islandês', 'is'],
  ['ca', 'Catalão', 'es'],
  ['nb', 'Norueguês (Bokmål)', 'no'],
]

// Categorias fixas do original (print 4) — agrupadas pelas categorias de vídeo
// do YouTube; os tópicos reais dos canais entram junto no dropdown.
const BASE_CATEGORIES = [
  'Outros',
  'Cristão',
  'História',
  'Música',
  'Desenvolvimento Pessoal',
  'Documentário',
  'Psicologia',
  'Crimes Reais',
  'Filmes',
  'Games',
  'Esportes',
  'Educação',
  'Tecnologia',
  'Comida',
  'Viagem',
  'Saúde',
  'Notícias',
]

const ADV_DEFAULT = { monetization: 'any', subsMin: '', subsMax: '', viewsMin: '', viewsMax: '', addedIn: 'any' }
const ADDED_IN = [
  ['any', 'Qualquer momento'],
  ['1h', 'Última hora'],
  ['24h', 'Últimas 24 horas'],
  ['7d', 'Últimos 7 dias'],
  ['30d', 'Últimos 30 dias'],
]
const ADDED_IN_MS = { '1h': 3600_000, '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 }

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

// Fecha dropdown ao clicar fora
function useClickOutside(onClose) {
  const ref = useRef(null)
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])
  return ref
}

// Dropdown estilizado (usado por Idioma/Views/Categoria/Ordenar — o nativo não
// renderiza bandeiras em imagem)
function FilterDropdown({ label, value, options, onChange, renderOption, width = 'w-48' }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(() => setOpen(false))
  const selected = options.find(([v]) => v === value)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
          value ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
        }`}
      >
        {selected && value ? (renderOption ? renderOption(selected, true) : selected[1]) : label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute left-0 top-full z-40 mt-1 max-h-72 ${width} overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 py-1 shadow-2xl`}>
          {options.map((opt) => {
            const [v] = opt
            return (
              <button
                key={v || '_all'}
                type="button"
                onClick={() => {
                  onChange(v)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-900 ${
                  v === value ? 'text-cyan-300' : 'text-slate-300'
                }`}
              >
                {renderOption ? renderOption(opt) : opt[1]}
                {v === value && <Check size={12} className="ml-auto shrink-0 text-cyan-400" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function NicheFinder() {
  const db = useDb()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('all')
  const [subRange, setSubRange] = useState('')
  const [viewRange, setViewRange] = useState('')
  const [language, setLanguage] = useState('')
  const [category, setCategory] = useState('')
  const [order, setOrder] = useState('views')
  const [monetizedOnly, setMonetizedOnly] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [adv, setAdv] = useState(ADV_DEFAULT)
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

  // Carimba addedAt na primeira vez que o canal aparece (filtro "Adicionado em")
  function stampAdded(list, previous = []) {
    const prevById = new Map(previous.map((c) => [c.id, c.addedAt]))
    return list.map((c) => ({ ...c, addedAt: prevById.get(c.id) || c.addedAt || Date.now() }))
  }

  async function fetchChannels(q) {
    setLoading(true)
    setError('')
    try {
      const { results: found, nextPageToken } = await api.youtube.searchChannels({ q, language })
      db.setSetting('nicheFinderCache', { ts: Date.now(), query: q, results: stampAdded(found, results), nextPageToken })
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
        results: [...results, ...stampAdded(more.filter((c) => !seen.has(c.id)))],
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

  // Categorias do dropdown: fixas do original + tópicos reais dos canais carregados
  const categories = [...new Set([...BASE_CATEGORIES, ...base.flatMap((c) => c.topics || [])])].sort((a, b) => a.localeCompare(b, 'pt'))

  // Filtros avançados aplicáveis a qualquer lista (usado também na prévia do modal)
  function applyAdv(list, a) {
    let out = list
    if (a.monetization === 'yes') out = out.filter(isMonetized)
    if (a.monetization === 'no') out = out.filter((c) => !isMonetized(c))
    if (a.subsMin !== '') out = out.filter((c) => c.subscribers >= Number(a.subsMin))
    if (a.subsMax !== '') out = out.filter((c) => c.subscribers <= Number(a.subsMax))
    if (a.viewsMin !== '') out = out.filter((c) => c.views >= Number(a.viewsMin))
    if (a.viewsMax !== '') out = out.filter((c) => c.views <= Number(a.viewsMax))
    if (a.addedIn !== 'any') {
      const cutoff = Date.now() - ADDED_IN_MS[a.addedIn]
      out = out.filter((c) => (c.addedAt || 0) >= cutoff)
    }
    return out
  }

  let filtered = base.filter((c) => activeTab.test(c))
  if (category) filtered = filtered.filter((c) => (c.topics || []).includes(category))
  if (text) filtered = filtered.filter((c) => `${c.title} ${c.description || ''} ${(c.topics || []).join(' ')}`.toLowerCase().includes(text))
  if (subRange) {
    const [min, max] = subRange.split('-')
    filtered = filtered.filter((c) => c.subscribers >= Number(min || 0) && (!max || c.subscribers <= Number(max)))
  }
  if (viewRange && viewRange !== 'custom') {
    const [min, max] = viewRange.split('-')
    filtered = filtered.filter((c) => c.views >= Number(min || 0) && (!max || c.views <= Number(max)))
  }
  if (monetizedOnly) filtered = filtered.filter(isMonetized)
  filtered = applyAdv(filtered, adv)

  filtered = [...filtered].sort((a, b) =>
    order === 'newest' ? new Date(b.publishedAt) - new Date(a.publishedAt) : (b[order] ?? 0) - (a[order] ?? 0),
  )

  const advActive = JSON.stringify(adv) !== JSON.stringify(ADV_DEFAULT)

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

      {/* Descrição da aba + Favoritos + botão de Filtros avançados */}
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
          <button
            onClick={() => setFiltersOpen(true)}
            className={`relative flex items-center justify-center rounded-lg border px-3 transition-colors ${
              advActive ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            }`}
            title="Filtros avançados"
          >
            <SlidersHorizontal size={14} />
            {advActive && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-cyan-400" />}
          </button>
        </div>
      </div>

      {/* Barra secundária: busca + Idioma + Inscritos + Views + Categoria + Monetizados + Ordenar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/40 px-3 py-2.5">
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className={`${inputCls} !h-9 !pl-9`}
            placeholder="Buscar por nome, nicho, idioma... (Enter busca no YouTube)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query.trim() && fetchChannels(query.trim())}
          />
        </div>

        <FilterDropdown
          label="Idioma"
          value={language}
          onChange={setLanguage}
          width="w-56"
          options={[['', 'Todos os idiomas', null], ...LANGUAGES]}
          renderOption={([, name, flag], compact) => (
            <span className="flex min-w-0 items-center gap-2">
              {flag && <img src={`https://flagcdn.com/w40/${flag}.png`} alt="" className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover" loading="lazy" />}
              <span className={compact ? 'max-w-24 truncate' : 'truncate'}>{name}</span>
            </span>
          )}
        />

        <FilterDropdown label="Inscritos" value={subRange} onChange={setSubRange} options={SUB_RANGES.map(([v, l]) => [v, v ? l : 'Todos'])} width="w-40" />

        <FilterDropdown
          label="Views"
          value={viewRange}
          onChange={(v) => {
            if (v === 'custom') {
              setViewRange('')
              setFiltersOpen(true) // Personalizado → De/Até no modal de filtros
            } else setViewRange(v)
          }}
          options={VIEW_RANGES}
          width="w-44"
        />

        <FilterDropdown label="Categoria" value={category} onChange={setCategory} options={[['', 'Todas'], ...categories.map((c) => [c, c])]} width="w-56" />

        <button
          onClick={() => setMonetizedOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            monetizedOnly ? 'border-green-500/60 bg-green-500/10 text-green-400' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
          }`}
          title="Mostrar somente canais monetizados"
        >
          <DollarSign size={13} className={monetizedOnly ? 'text-green-400' : 'text-slate-500'} />
          Monetizados
        </button>

        <FilterDropdown label="Ordenar" value={order} onChange={setOrder} options={SORT_OPTIONS} width="w-44" />
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

      {!loading && filtered.length > 0 && tab !== 'bycategory' && (
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

      {/* Aba "Por Categoria": canais agrupados pela categoria de vídeo */}
      {!loading && filtered.length > 0 && tab === 'bycategory' && (
        <div className="space-y-6">
          {Object.entries(
            filtered.reduce((acc, c) => {
              const cat = c.topics?.[0] || 'Outros'
              ;(acc[cat] = acc[cat] || []).push(c)
              return acc
            }, {}),
          )
            .sort(([, a], [, b]) => b.length - a.length)
            .map(([cat, list]) => (
              <div key={cat}>
                <div className="mb-3 flex items-center gap-2">
                  <FolderOpen size={15} className="text-cyan-400" />
                  <h3 className="text-sm font-bold text-slate-100">{cat}</h3>
                  <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300">{list.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                  {list.map((c) => (
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
              </div>
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

      <AdvancedFiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        adv={adv}
        onApply={(next) => {
          setAdv(next)
          setFiltersOpen(false)
        }}
        // prévia do contador considera as outras seleções ativas da página
        countFor={(draft) => applyAdv(base.filter((c) => activeTab.test(c)), draft).length}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal "Filtros avançados" (print 1): filtros salvos, monetização, inscritos
// De/Até, views De/Até, adicionado em, rodapé com contador ao vivo.
// ---------------------------------------------------------------------------
function AdvancedFiltersModal({ open, onClose, adv, onApply, countFor }) {
  const db = useDb()
  const [draft, setDraft] = useState(adv)
  const saved = db.getSetting('nicheSavedFilters', [])

  useEffect(() => {
    if (open) setDraft(adv)
  }, [open, adv])

  if (!open) return null
  const count = countFor(draft)
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))

  function saveCurrent() {
    const name = `Filtro ${saved.length + 1}`
    db.setSetting('nicheSavedFilters', [...saved, { id: Date.now(), name, filters: draft }])
  }

  const Section = ({ title, children }) => (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
      <p className="mb-3 text-[10px] font-bold tracking-[0.15em] text-slate-500">{title}</p>
      {children}
    </div>
  )

  const chip = (active) =>
    `rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
      active ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-100">Filtros avançados</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-900 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <Section title="SEUS FILTROS SALVOS">
            <p className="mb-2.5 text-xs text-slate-500">Salve combinações de filtros para acesso rápido</p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={saveCurrent} className={`${btnGhost} flex items-center gap-1.5 !px-3 !py-1.5 !text-xs`}>
                <Save size={12} />
                Salvar atual
              </button>
              {saved.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 py-1 pl-3 pr-1.5 text-xs text-slate-300">
                  <button onClick={() => setDraft(s.filters)} className="hover:text-cyan-300">
                    {s.name}
                  </button>
                  <button
                    onClick={() => db.setSetting('nicheSavedFilters', saved.filter((f) => f.id !== s.id))}
                    className="text-slate-600 hover:text-red-400"
                    title="Excluir filtro salvo"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            </div>
          </Section>

          <Section title="STATUS">
            <p className="mb-2 text-xs font-semibold text-slate-300">Monetização</p>
            <div className="flex gap-2">
              {[
                ['any', 'Qualquer'],
                ['yes', 'Sim'],
                ['no', 'Não'],
              ].map(([v, l]) => (
                <button key={v} onClick={() => set('monetization', v)} className={chip(draft.monetization === v)}>
                  {l}
                </button>
              ))}
            </div>
          </Section>

          <Section title="INSCRITOS">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">De</label>
                <input className={inputCls} type="number" min="0" placeholder="—" value={draft.subsMin} onChange={(e) => set('subsMin', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">Até</label>
                <input className={inputCls} type="number" min="0" placeholder="—" value={draft.subsMax} onChange={(e) => set('subsMax', e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="VIEWS">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">De</label>
                <input className={inputCls} type="number" min="0" placeholder="—" value={draft.viewsMin} onChange={(e) => set('viewsMin', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">Até</label>
                <input className={inputCls} type="number" min="0" placeholder="—" value={draft.viewsMax} onChange={(e) => set('viewsMax', e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="ADICIONADO EM">
            <div className="flex flex-wrap gap-2">
              {ADDED_IN.map(([v, l]) => (
                <button key={v} onClick={() => set('addedIn', v)} className={chip(draft.addedIn === v)}>
                  {l}
                </button>
              ))}
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3.5">
          <button onClick={() => setDraft(ADV_DEFAULT)} className={`${btnGhost} !px-4 !py-2 !text-xs`}>
            Limpar tudo
          </button>
          <span className="text-xs text-slate-500">{count} canais correspondem</span>
          <button onClick={() => onApply(draft)} className={`${btnPrimary} !px-4 !py-2 !text-xs`}>
            Aplicar filtros
          </button>
        </div>
      </div>
    </div>
  )
}

function ChannelCard({ channel: c, isFavorite, onToggleFavorite, onOpenDoubling, cacheTs }) {
  const badge = TREND_TABS.slice(1).find((t) => t.test(c))
  const monetized = isMonetized(c)

  return (
    <div className="card-hover overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 hover:border-cyan-500/40">
      <div className="border-t-2 border-cyan-500/60" />
      {/* modo privado: o card inteiro fica embaçado */}
      <div className="sensitive p-3.5">
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
            <div className="flex items-center gap-1.5">
              <button onClick={onOpenDoubling} className="block max-w-full truncate text-sm font-bold text-slate-100 hover:text-cyan-300" title="Analisar na Dobra de Nicho">
                {c.title}
              </button>
              {/* $ verde: canal monetizado — diferencia mesmo sem o filtro ativo */}
              {monetized && <DollarSign size={14} className="shrink-0 cursor-help text-green-400" title="Monetizado" />}
            </div>
            <p className="truncate text-[11px] text-slate-500">
              {(c.topics || []).length > 0 && <span className="text-cyan-400/80">{c.topics[0]} · </span>}
              {c.description || 'Sem descrição'}
            </p>
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

        {/* Stats: Inscritos / Views / Vídeos / Faceless (como no original) */}
        <div className="mt-3 grid grid-cols-4 divide-x divide-slate-800 rounded-lg border border-slate-800 py-2 text-center">
          <CardStat value={formatCompact(c.subscribers)} label="INSCRITOS" />
          <CardStat value={formatCompact(c.views)} label="VIEWS" />
          <CardStat value={c.videoCount ?? '—'} label="VÍDEOS" />
          <CardStat value={`${facelessScore(c)}%`} label="FACELESS" faceless={facelessScore(c) >= 40} />
        </div>

        {/* Rodapé de cadência */}
        <div className="mt-3 space-y-1 border-t border-slate-800 pt-2.5 text-[10px] text-slate-500">
          <p className="flex items-center gap-1.5">
            <Calendar size={10} />
            {ageDays(c) <= 90 ? `${ageDays(c)}d postando` : `${Math.round(ageDays(c) / 30)}m postando`}
            {c.lastUploadDaysAgo != null && ` · último há ${c.lastUploadDaysAgo}d`}
            {c.vidsPerMonth != null && ` · ${c.vidsPerMonth} vid/mês`}
            {c.viewsPerMonth != null && ` · ${formatCompact(c.viewsPerMonth)} views/mês`}
          </p>
          <p className="flex items-center gap-1.5">
            <Clock size={10} />
            {c.addedAt ? `Adicionado há ${timeAgo(c.addedAt)} · ` : ''}
            {cacheTs ? `atualizado há ${timeAgo(cacheTs)}` : 'atualizado agora'}
          </p>
        </div>
      </div>
    </div>
  )
}

function CardStat({ value, label, accent, faceless }) {
  return (
    <div className="px-1">
      <p className={`truncate text-xs font-bold ${faceless ? 'text-amber-400' : accent ? 'text-cyan-400' : 'text-slate-100'}`}>{value}</p>
      <p className="text-[8px] font-semibold tracking-wider text-slate-600">{label}</p>
    </div>
  )
}
