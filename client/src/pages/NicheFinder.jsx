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
  Link2,
  GitBranch,
  Rocket,
} from 'lucide-react'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, btnPrimary, btnGhost, EmptyState, formatCompact } from '../components/ui'

// Nome do idioma na língua da interface (evita traduzir 50 nomes à mão)
function langLabel(code, uiLang) {
  try {
    const n = new Intl.DisplayNames([uiLang], { type: 'language' }).of(code)
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : code
  } catch {
    return code
  }
}
import { PrivacyScope, PageEye, Masked, RestrictedThumb, useRestricted } from '../components/privacy'

// Consulta padrão usada para pré-carregar a página na primeira visita.

// Idade do canal em dias (desde a criação no YouTube)
function ageDays(c) {
  return Math.max(0, Math.round((Date.now() - new Date(c.publishedAt).getTime()) / 86_400_000))
}

// Idade legível: "18d", "5m", "12a 6m" (como no original)
function ageLabel(c) {
  const d = ageDays(c)
  if (d < 60) return `${d}d`
  const months = Math.round(d / 30)
  if (months < 12) return `${months}m`
  const years = Math.floor(months / 12)
  const rem = months % 12
  return rem ? `${years}a ${rem}m` : `${years}a`
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
    key: 'outlier',
    label: 'Fora da Curva',
    Icon: Rocket,
    desc: 'Canais com números absurdos: +5M inscritos, ou +100M views totais, ou +50M views com menos de 500 vídeos',
    test: (c) =>
      c.subscribers >= 5_000_000 ||
      c.views >= 100_000_000 ||
      (c.views >= 50_000_000 && (c.videoCount || 9999) < 500),
  },
  {
    key: 'bycategory',
    label: 'Por Categoria',
    Icon: FolderOpen,
    desc: 'Canais agrupados pelas categorias de vídeo do YouTube',
    test: () => true,
  },
  { key: 'all', label: 'Todos os Resultados', Icon: LayoutGrid, desc: 'Todos os canais carregados nesta busca', test: () => true },
]

// Categoria de validação que um canal representa (liga a descoberta ao método):
// "Porta aberta" (canal pequeno com muito alcance), "Demanda viva" (assunto
// quente agora) ou "Referência" (player forte pra comparar). Deriva dos dados
// do próprio canal — sem chamada extra.
function olharFor(c) {
  const age = ageDays(c)
  if (c.subscribers < 1000 && c.views > 50_000) return { key: 'door', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' }
  if (age <= 30 && c.subscribers < 1000) return { key: 'door', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' }
  if (c.subscribers >= 5_000_000 || c.views >= 100_000_000) return { key: 'bench', color: 'border-slate-600 bg-slate-700/40 text-slate-300' }
  if (age <= 60 && c.views >= 100_000) return { key: 'demand', color: 'border-red-500/40 bg-red-500/10 text-red-300' }
  return null
}

// Estimativa "Faceless %" — probabilidade do canal NÃO mostrar rosto. Não existe
// API pública de detecção facial; usamos sinais determinísticos do canal:
// tópicos que costumam ser narrados (sem rosto) somam, tópicos "de rosto"
// (vlog, beleza, comédia) subtraem, e palavras-chave do título/descrição ajustam.
const FACELESS_TOPICS = ['Documentário', 'História', 'Educação', 'Tecnologia', 'Militar', 'Música Religiosa', 'Cristão', 'Notícias', 'Ciência', 'Política', 'Sociedade']
const FACE_TOPICS = ['Comédia', 'Beleza', 'Moda', 'Fitness', 'Lifestyle', 'Esportes', 'Games', 'Pets']
const FACELESS_WORDS = [
  'documentari', 'histór', 'history', 'curiosidad', 'fatos', 'facts', 'mistério', 'mystery', 'explained', 'explica',
  'narrat', 'lyrics', 'relax', 'sleep', 'study', 'asmr', 'compilation', 'ranking', 'biografia', 'contos', 'tales',
  'stories', 'top 10', 'top 5', 'dark', 'creepy', 'terror', 'universo', 'space', 'ciência', 'science',
]
const FACE_WORDS = ['vlog', 'meu canal', 'my channel', 'reaction', 'reagindo', 'gameplay', 'cadê', 'rotina', 'daily', 'face', 'eu ']

export function facelessScore(c) {
  const text = `${c.title || ''} ${c.description || ''}`.toLowerCase()
  const topics = c.topics || []
  let score = 45
  score += topics.filter((t) => FACELESS_TOPICS.includes(t)).length * 12
  score -= topics.filter((t) => FACE_TOPICS.includes(t)).length * 18
  score += FACELESS_WORDS.filter((w) => text.includes(w)).length * 6
  score -= FACE_WORDS.filter((w) => text.includes(w)).length * 10
  // jitter estável por id só para não empatar tudo em múltiplos de 5 redondos
  let hash = 0
  for (const ch of c.id || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  score += (hash % 7) - 3
  return Math.max(0, Math.min(98, Math.round(score / 5) * 5))
}

// Cor do número Faceless: verde >70%, amarelo até 70%, branco se 0% (como o original)
export function facelessColor(score) {
  if (!score) return 'text-slate-100'
  if (score > 70) return 'text-green-400'
  return 'text-amber-400'
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
// [código ISO p/ relevanceLanguage, país da bandeira]. O nome é resolvido
// na língua da interface via langLabel() (Intl.DisplayNames).
const LANGUAGES = [
  ['en', 'us'], ['pt', 'br'], ['es', 'es'], ['de', 'de'], ['pl', 'pl'], ['ru', 'ru'], ['fr', 'fr'], ['it', 'it'],
  ['ja', 'jp'], ['ko', 'kr'], ['zh', 'cn'], ['hi', 'in'], ['ar', 'sa'], ['tr', 'tr'], ['nl', 'nl'], ['sv', 'se'],
  ['no', 'no'], ['da', 'dk'], ['fi', 'fi'], ['el', 'gr'], ['cs', 'cz'], ['hu', 'hu'], ['ro', 'ro'], ['uk', 'ua'],
  ['bg', 'bg'], ['sr', 'rs'], ['hr', 'hr'], ['sk', 'sk'], ['sl', 'si'], ['th', 'th'], ['vi', 'vn'], ['id', 'id'],
  ['ms', 'my'], ['tl', 'ph'], ['he', 'il'], ['fa', 'ir'], ['ur', 'pk'], ['bn', 'bd'], ['ta', 'in'], ['te', 'in'],
  ['mr', 'in'], ['pa', 'in'], ['sw', 'ke'], ['af', 'za'], ['et', 'ee'], ['lv', 'lv'], ['lt', 'lt'], ['is', 'is'],
  ['ca', 'es'], ['nb', 'no'],
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
  return `${Math.round(h / 24)}d`
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
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('exploding') // padrão: "Explodindo Agora"
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

  // A base agora é GLOBAL (Supabase) e compartilhada por todos. O filtro por aba
  // é feito no servidor; o cache local é só fallback offline.
  const [results, setResults] = useState(() => db.getSetting('nicheFinderCache')?.results || [])
  const [stats, setStats] = useState({ total: 0, thisWeek: 0 })
  const [totalFiltered, setTotalFiltered] = useState(0)
  const [pageNum, setPageNum] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE = 400

  // Aba "Por Categoria": acordeão de TODAS as categorias com contagem/views
  // globais (agregação no servidor). Cada categoria expande sob demanda.
  const [catStats, setCatStats] = useState([])
  const [catLoading, setCatLoading] = useState(false)
  const [catOpen, setCatOpen] = useState(null)
  const [catChannels, setCatChannels] = useState({})
  const [catBusy, setCatBusy] = useState(false)

  const favorites = db.getSetting('nicheFavorites', [])
  const hasKeys = (db.getSetting('ytKeys', []) || []).some(Boolean)

  const trendParam = (tk) => (tk === 'all' || tk === 'bycategory' ? '' : tk)
  function baseParams(p) {
    const [subMin, subMax] = subRange ? subRange.split('-') : ['', '']
    const [viewMin, viewMax] = viewRange && viewRange !== 'custom' ? viewRange.split('-') : ['', '']
    return {
      trend: trendParam(tab),
      category: category || '',
      sort: order,
      subMin: subMin || '',
      subMax: subMax || '',
      viewMin: viewMin || '',
      viewMax: viewMax || '',
      monetized: monetizedOnly ? '1' : '',
      page: p,
      pageSize: PAGE,
    }
  }

  async function loadStats() {
    try {
      setStats(await api.channels.stats())
    } catch {
      /* Supabase indisponível — segue com o cache local */
    }
  }

  async function loadBase(reset = true) {
    if (showFavorites) return
    reset ? setLoading(true) : setLoadingMore(true)
    setError('')
    try {
      const p = reset ? 0 : pageNum + 1
      const { results: rows, total } = await api.channels.list(baseParams(p))
      setResults((prev) => {
        const merged = reset ? rows : [...prev, ...rows.filter((r) => !prev.some((x) => x.id === r.id))]
        if (reset) db.setSetting('nicheFinderCache', { ts: Date.now(), results: merged.slice(0, 400) })
        return merged
      })
      setPageNum(p)
      setTotalFiltered(total)
      setHasMore((p + 1) * PAGE < total)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Recarrega do servidor quando muda a aba ou os filtros de faixa/ordem.
  useEffect(() => {
    loadBase(true)
  }, [tab, subRange, viewRange, category, monetizedOnly, order]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega a agregação global de categorias ao abrir a aba "Por Categoria".
  useEffect(() => {
    if (tab !== 'bycategory') return
    setCatLoading(true)
    api.channels
      .categories()
      .then(({ categories }) => setCatStats(categories || []))
      .catch(() => setCatStats([]))
      .finally(() => setCatLoading(false))
  }, [tab])

  // Expande/recolhe uma categoria; na 1ª abertura busca os canais dela.
  async function toggleCat(cat) {
    if (catOpen === cat) return setCatOpen(null)
    setCatOpen(cat)
    if (catChannels[cat]) return
    setCatBusy(true)
    try {
      const { results: list } = await api.channels.list({ category: cat, pageSize: 60, sort: order })
      setCatChannels((m) => ({ ...m, [cat]: list || [] }))
    } catch {
      setCatChannels((m) => ({ ...m, [cat]: [] }))
    } finally {
      setCatBusy(false)
    }
  }

  // Busca no YouTube → grava na base GLOBAL (todos passam a ver) e mostra na hora.
  async function fetchChannels(q) {
    if (!hasKeys) {
      setError('Configure suas chaves da YouTube API em Perfil → APIs para buscar novos canais.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { results: found } = await api.youtube.searchChannels({ q, language })
      api.channels.upsert(found).catch(() => {}) // alimenta a base global
      setResults((prev) => {
        const seen = new Set(prev.map((c) => c.id))
        return [...found.filter((c) => !seen.has(c.id)).map((c) => ({ ...c, addedAt: Date.now() })), ...prev]
      })
      loadStats()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function loadMore() {
    if (hasMore && !loadingMore) loadBase(false)
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
    <PrivacyScope page="niche-finder">
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
              {stats.total > 0 && (
                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                  {t('niche.count', { n: formatCompact(stats.total) })}{stats.thisWeek > 0 ? t('niche.thisWeek', { n: formatCompact(stats.thisWeek) }) : ''}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">{t('niche.subtitle')}</p>
          </div>
        </div>
        <PageEye />
      </div>

      {/* Abas de tendência */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1">
          {TREND_TABS.map(({ key, Icon }) => {
            const active = tab === key
            // Contagem: aba ativa mostra o total real do servidor; favoritos contam local.
            const count = showFavorites
              ? favorites.filter((c) => TREND_TABS.find((t) => t.key === key).test(c)).length
              : active
                ? totalFiltered
                : null
            // "Explodindo Agora" fica sempre em vermelho (quente).
            const hot = key === 'exploding'
            const cls = hot
              ? active
                ? 'border-red-500 bg-red-500/15 text-red-300'
                : 'border-red-500/50 bg-red-500/10 text-red-400 hover:border-red-500'
              : active
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                title={t(`niche.tabs.${key}.desc`)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${cls}`}
              >
                <Icon size={13} className={hot ? 'fill-red-500/30' : ''} />
                {t(`niche.tabs.${key}.label`)}
                {count != null && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active ? (hot ? 'bg-red-500/20 text-red-300' : 'bg-cyan-500/20 text-cyan-300') : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {formatCompact(count)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Descrição da aba + Favoritos + botão de Filtros avançados */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{t(`niche.tabs.${tab}.desc`)}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFavorites((v) => !v)}
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
              showFavorites ? 'border-red-500/50 bg-red-500/10 text-red-400' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Heart size={14} className={showFavorites ? 'fill-red-400' : ''} />
            {t('niche.favorites')}
            <span className="rounded-full bg-slate-800 px-1.5 text-[10px]">{favorites.length}</span>
          </button>
          <button
            onClick={() => setFiltersOpen(true)}
            className={`relative flex items-center justify-center rounded-lg border px-3 transition-colors ${
              advActive ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
            }`}
            title={t('niche.advFilters')}
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
            placeholder={t('niche.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && query.trim() && fetchChannels(query.trim())}
          />
        </div>

        <FilterDropdown
          label={t('niche.language')}
          value={language}
          onChange={setLanguage}
          width="w-56"
          options={[['', t('niche.allLanguages'), null], ...LANGUAGES.map(([code, flag]) => [code, langLabel(code, lang), flag])]}
          renderOption={([, name, flag], compact) => (
            <span className="flex min-w-0 items-center gap-2">
              {flag && <img src={`https://flagcdn.com/w40/${flag}.png`} alt="" className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover" loading="lazy" />}
              <span className={compact ? 'max-w-24 truncate' : 'truncate'}>{name}</span>
            </span>
          )}
        />

        <FilterDropdown label={t('niche.subs')} value={subRange} onChange={setSubRange} options={SUB_RANGES.map(([v, l]) => [v, v ? (l === 'Até 1K' ? t('niche.subUpTo') : l) : t('niche.subAll')])} width="w-40" />

        <FilterDropdown
          label={t('niche.views')}
          value={viewRange}
          onChange={(v) => {
            if (v === 'custom') {
              setViewRange('')
              setFiltersOpen(true) // Personalizado → De/Até no modal de filtros
            } else setViewRange(v)
          }}
          options={VIEW_RANGES.map(([v, l]) => [v, v === '' ? t('niche.viewAll') : v === 'custom' ? t('niche.custom') : l])}
          width="w-44"
        />

        <FilterDropdown label={t('niche.category')} value={category} onChange={setCategory} options={[['', t('niche.allCategories')], ...categories.map((c) => [c, c])]} width="w-56" />

        <button
          onClick={() => setMonetizedOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            monetizedOnly ? 'border-green-500/60 bg-green-500/10 text-green-400' : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
          }`}
          title={t('niche.monetizedTitle')}
        >
          <DollarSign size={13} className={monetizedOnly ? 'text-green-400' : 'text-slate-500'} />
          {t('niche.monetized')}
        </button>

        <FilterDropdown label={t('niche.sortLabel')} value={order} onChange={setOrder} options={SORT_OPTIONS.map(([v]) => [v, t(`niche.sorts.${v}`)])} width="w-44" />
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {loading && (
        <div className="flex flex-col items-center py-16">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
          <p className="mt-3 text-sm text-slate-500">{t('niche.loading')}</p>
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <EmptyState
          icon={Compass}
          title={hasKeys ? t('niche.emptyTitle') : t('niche.noKeysTitle')}
          description={hasKeys ? t('niche.emptyDesc') : t('niche.noKeysDesc')}
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
              cacheTs={null}
            />
          ))}
        </div>
      )}

      {/* Aba "Por Categoria": acordeão global — TODAS as categorias com contagem/views,
          expandindo sob demanda em mini-cards (como no original). */}
      {tab === 'bycategory' && (
        <div>
          <p className="mb-3 text-xs text-slate-500">{t('niche.byNiche')}</p>
          {catLoading && catStats.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 size={20} className="animate-spin text-cyan-400" />
            </div>
          ) : catStats.length === 0 ? (
            <EmptyState icon={FolderOpen} title={t('niche.catEmptyTitle')} description={t('niche.catEmptyDesc')} />
          ) : (
            <div className="space-y-2">
              {catStats.map(({ category: cat, count, views }) => {
                const open = catOpen === cat
                const list = catChannels[cat]
                return (
                  <div key={cat} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                    <button onClick={() => toggleCat(cat)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-800/40">
                      <FolderOpen size={17} className="shrink-0 text-cyan-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-100">{cat}</span>
                        <span className="text-[11px] text-slate-500">
                          {formatCompact(count)} · {formatCompact(views)} views
                        </span>
                      </span>
                      <ChevronDown size={17} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <div className="border-t border-slate-800/70 p-4">
                        {!list ? (
                          <div className="flex justify-center py-6">
                            <Loader2 size={18} className="animate-spin text-cyan-400" />
                          </div>
                        ) : list.length === 0 ? (
                          <p className="py-4 text-center text-xs text-slate-600">{t('niche.noChannelInCat')}</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                            {list.map((c) => (
                              <a
                                key={c.id}
                                href={`https://youtube.com/channel/${c.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 transition-colors hover:border-cyan-500/40"
                              >
                                {c.avatar ? (
                                  <img src={c.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                                ) : (
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-400">{(c.title || '?').charAt(0)}</div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-semibold text-slate-100">{c.title}</p>
                                  <p className="text-[10px] text-slate-500">
                                    {formatCompact(c.subscribers)} {t('niche.subscribersWord')} · {formatCompact(c.views)} {t('niche.viewsWord')}
                                  </p>
                                </div>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!loading && tab !== 'bycategory' && results.length > 0 && filtered.length === 0 && (
        <EmptyState icon={TrendingUp} title={t('niche.noFilterTitle')} description={t('niche.noFilterDesc')} />
      )}

      {/* Mostrar mais — pagina a base global do servidor */}
      {!loading && !showFavorites && tab !== 'bycategory' && filtered.length > 0 && hasMore && (
        <div className="flex justify-center pb-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-6 py-2.5 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
          >
            {loadingMore ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {loadingMore ? t('niche.loadingMore') : t('niche.showMore')}
          </button>
        </div>
      )}
      {!loading && !showFavorites && tab !== 'bycategory' && results.length > 0 && !hasMore && (
        <p className="pb-4 text-center text-xs text-slate-600">{t('niche.endOfBase')}</p>
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
    </PrivacyScope>
  )
}

// ---------------------------------------------------------------------------
// Modal "Filtros avançados" (print 1): filtros salvos, monetização, inscritos
// De/Até, views De/Até, adicionado em, rodapé com contador ao vivo.
// ---------------------------------------------------------------------------
function AdvancedFiltersModal({ open, onClose, adv, onApply, countFor }) {
  const db = useDb()
  const { t } = useI18n()
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
          <h2 className="text-sm font-bold text-slate-100">{t('niche.adv.title')}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-900 hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <Section title={t('niche.adv.savedTitle')}>
            <p className="mb-2.5 text-xs text-slate-500">{t('niche.adv.savedDesc')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={saveCurrent} className={`${btnGhost} flex items-center gap-1.5 !px-3 !py-1.5 !text-xs`}>
                <Save size={12} />
                {t('niche.adv.saveCurrent')}
              </button>
              {saved.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 py-1 pl-3 pr-1.5 text-xs text-slate-300">
                  <button onClick={() => setDraft(s.filters)} className="hover:text-cyan-300">
                    {s.name}
                  </button>
                  <button
                    onClick={() => db.setSetting('nicheSavedFilters', saved.filter((f) => f.id !== s.id))}
                    className="text-slate-600 hover:text-red-400"
                    title={t('niche.adv.deleteSaved')}
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            </div>
          </Section>

          <Section title={t('niche.adv.statusTitle')}>
            <p className="mb-2 text-xs font-semibold text-slate-300">{t('niche.adv.monetization')}</p>
            <div className="flex gap-2">
              {[
                ['any', t('niche.adv.any')],
                ['yes', t('niche.adv.yes')],
                ['no', t('niche.adv.no')],
              ].map(([v, l]) => (
                <button key={v} onClick={() => set('monetization', v)} className={chip(draft.monetization === v)}>
                  {l}
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('niche.adv.subsTitle')}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">{t('niche.adv.from')}</label>
                <input className={inputCls} type="number" min="0" placeholder="—" value={draft.subsMin} onChange={(e) => set('subsMin', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">{t('niche.adv.to')}</label>
                <input className={inputCls} type="number" min="0" placeholder="—" value={draft.subsMax} onChange={(e) => set('subsMax', e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title={t('niche.adv.viewsTitle')}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">{t('niche.adv.from')}</label>
                <input className={inputCls} type="number" min="0" placeholder="—" value={draft.viewsMin} onChange={(e) => set('viewsMin', e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">{t('niche.adv.to')}</label>
                <input className={inputCls} type="number" min="0" placeholder="—" value={draft.viewsMax} onChange={(e) => set('viewsMax', e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title={t('niche.adv.addedInTitle')}>
            <div className="flex flex-wrap gap-2">
              {ADDED_IN.map(([v]) => (
                <button key={v} onClick={() => set('addedIn', v)} className={chip(draft.addedIn === v)}>
                  {t(`niche.adv.addedIn.${v === '' ? 'any' : v}`)}
                </button>
              ))}
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3.5">
          <button onClick={() => setDraft(ADV_DEFAULT)} className={`${btnGhost} !px-4 !py-2 !text-xs`}>
            {t('niche.adv.clearAll')}
          </button>
          <span className="text-xs text-slate-500">{t('niche.adv.matchCount', { n: count })}</span>
          <button onClick={() => onApply(draft)} className={`${btnPrimary} !px-4 !py-2 !text-xs`}>
            {t('niche.adv.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChannelCard({ channel: c, isFavorite, onToggleFavorite, onOpenDoubling, cacheTs }) {
  const { t } = useI18n()
  // Selo de tendência real do canal — ignora 'all' e o catch-all 'bycategory'
  const badge = TREND_TABS.filter((tb) => tb.key !== 'all' && tb.key !== 'bycategory' && tb.key !== 'outlier').find((tb) => tb.test(c))
  const olhar = olharFor(c) // categoria de validação (porta aberta / demanda viva / referência)
  const monetized = isMonetized(c)
  // Modo restrito: nome/números/thumbs NÃO entram no DOM — impossível "desborrar"
  const restricted = useRestricted()
  const [copied, setCopied] = useState(false)
  const channelUrl = `https://youtube.com/channel/${c.id}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(channelUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <div className="card-hover overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40 hover:border-cyan-500/40">
      <div className="border-t-2 border-cyan-500/60" />
      <div className="p-3.5">
        {/* Cabeçalho do card */}
        <div className="flex items-start gap-2.5">
          <div className="relative shrink-0">
            {restricted ? (
              <div className="flex h-11 w-11 select-none items-center justify-center rounded-full border border-slate-700 bg-slate-800 font-bold text-slate-500">?</div>
            ) : c.avatar ? (
              <img src={c.avatar} alt="" className="h-11 w-11 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 font-bold text-slate-300">{c.title?.charAt(0)}</div>
            )}
            {!restricted && <CountryFlag country={c.country} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {/* Nome → abre o canal no YouTube (não mais a Dobra) */}
              {restricted ? (
                <span className="block max-w-full truncate text-sm font-bold text-slate-100"><Masked mask="•••••••">{c.title}</Masked></span>
              ) : (
                <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="block max-w-full truncate text-sm font-bold text-slate-100 hover:text-cyan-300" title={t('niche.card.openChannel')}>
                  {c.title}
                </a>
              )}
              {/* $ verde: elegível à monetização (estimativa, não confirmação) */}
              {monetized && <DollarSign size={14} className="shrink-0 cursor-help text-green-400" title={t('niche.card.monetTip')} />}
            </div>
            {/* Categoria/tópicos do canal, legível (como no original: "Música · Covers") */}
            <p className="truncate text-[11px] font-medium text-slate-400">
              {(c.topics || []).length > 0 ? c.topics.slice(0, 2).join(' · ') : t('niche.card.noCat')}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {badge && (
                <span className="inline-block rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-400">{t(`niche.tabs.${badge.key}.label`)}</span>
              )}
              {olhar && (
                <span title={t(`niche.guide.${olhar.key}Desc`)} className={`inline-flex cursor-help items-center gap-0.5 rounded-full border px-2 py-0.5 text-[9px] font-bold ${olhar.color}`}>
                  <Compass size={9} /> {t(`niche.guide.${olhar.key}`)}
                </span>
              )}
            </div>
          </div>
          {/* Ações: copiar link · analisar na Dobra · favoritar */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={copyLink} title={copied ? t('niche.card.linkCopied') : t('niche.card.copyLink')} className={copied ? 'text-green-400' : 'text-slate-600 hover:text-cyan-300'}>
              {copied ? <Check size={15} /> : <Link2 size={15} />}
            </button>
            <button onClick={onOpenDoubling} title={t('niche.card.analyzeDoubling')} className="text-slate-600 hover:text-cyan-300">
              <GitBranch size={15} />
            </button>
            <button onClick={onToggleFavorite} title={isFavorite ? t('niche.card.removeFavorite') : t('niche.card.favorite')}>
              <Heart size={15} className={isFavorite ? 'fill-red-400 text-red-400' : 'text-slate-600 hover:text-red-400'} />
            </button>
          </div>
        </div>

        {/* Thumbnails dos últimos vídeos — no modo restrito viram "?" */}
        {c.recentVideos?.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {c.recentVideos.map((v) =>
              restricted ? (
                <div key={v.id} className="flex aspect-video w-full select-none items-center justify-center rounded-md bg-slate-800/80 text-base font-bold text-slate-500" title={t('niche.card.restrictedContent')}>
                  ?
                </div>
              ) : (
                <a key={v.id} href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer" className="relative overflow-hidden rounded-md">
                  <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover transition-transform hover:scale-110" loading="lazy" />
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-px text-[9px] font-bold text-white">{formatCompact(v.views)}</span>
                </a>
              ),
            )}
          </div>
        )}

        {/* Stats: Inscritos / Views / Vídeos / Faceless (como no original) */}
        <div className="mt-3 grid grid-cols-4 divide-x divide-slate-800 rounded-lg border border-slate-800 py-2 text-center">
          <CardStat value={<Masked mask="••">{formatCompact(c.subscribers)}</Masked>} label={t('niche.card.subs')} title={t('niche.card.subsTip')} />
          <CardStat value={<Masked mask="••">{formatCompact(c.views)}</Masked>} label={t('niche.card.views')} title={t('niche.card.viewsTip')} />
          <CardStat value={<Masked mask="••">{c.videoCount ?? '—'}</Masked>} label={t('niche.card.videos')} title={t('niche.card.videosTip')} />
          <CardStat
            value={<Masked mask="••">{`${facelessScore(c)}%`}</Masked>}
            label={t('niche.card.faceless')}
            facelessValue={facelessScore(c)}
            title={t('niche.card.facelessTip')}
          />
        </div>

        {/* Rodapé de cadência */}
        <div className="mt-3 space-y-1 border-t border-slate-800 pt-2.5 text-[10px] text-slate-500">
          <p className="flex items-center gap-1.5">
            <Calendar size={10} />
            {`${ageLabel(c)} ${t('niche.card.posting')}`}
            {c.lastUploadDaysAgo != null && ` · ${t('niche.card.last')} ${c.lastUploadDaysAgo}d`}
            {c.vidsPerMonth != null && ` · ${c.vidsPerMonth} ${t('niche.card.vidMo')}`}
            {c.viewsPerMonth != null && ` · ${formatCompact(c.viewsPerMonth)} ${t('niche.card.viewsMo')}`}
          </p>
          <p className="flex items-center gap-1.5">
            <Clock size={10} />
            {c.addedAt ? `${t('niche.card.added')} ${timeAgo(c.addedAt)} · ` : ''}
            {cacheTs ? `${t('niche.card.updated')} ${timeAgo(cacheTs)}` : t('niche.card.updatedNow')}
          </p>
        </div>
      </div>
    </div>
  )
}

function CardStat({ value, label, accent, facelessValue, title }) {
  const color = facelessValue != null ? facelessColor(facelessValue) : accent ? 'text-cyan-400' : 'text-slate-100'
  return (
    <div className="px-1" title={title}>
      <p className={`truncate text-xs font-bold ${color} ${title ? 'cursor-help' : ''}`}>{value}</p>
      <p className="text-[8px] font-semibold tracking-wider text-slate-600">{label}</p>
    </div>
  )
}
