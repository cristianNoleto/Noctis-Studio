import { useState } from 'react'
import { Search, Loader2, TrendingUp, Bookmark, X, SlidersHorizontal, BarChart3, Target, Lightbulb, Trash2, ExternalLink } from 'lucide-react'
import { useDb } from '../lib/db'
import { useI18n } from '../i18n'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, formatCompact } from '../components/ui'
import { PrivacyScope, PageEye, Masked, RestrictedThumb, useRestricted } from '../components/privacy'
import { Field } from './channels/ChannelsList'

// Chaves de período (labels traduzidos via i18n; '' = qualquer data)
const PERIOD_KEYS = [['', 'any'], ['24h', '24h'], ['7d', '7d'], ['30d', '30d']]

const initialFilters = { q: '', period: '', durMinSec: 300, after: '', before: '', minViews: '' }

const MAX_VIRAL = 100 // teto de vídeos por busca, como no original

export default function ViralVideos() {
  const db = useDb()
  const { t } = useI18n()
  const [filters, setFilters] = useState(initialFilters)
  const [tab, setTab] = useState('search')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [nextPageToken, setNextPageToken] = useState(null)

  const saved = db.all('savedViralVideos')

  function set(k, v) {
    setFilters((f) => ({ ...f, [k]: v }))
  }

  function baseParams() {
    return {
      q: filters.q.trim(),
      period: filters.period,
      durMinSec: filters.durMinSec || '',
      after: filters.after,
      before: filters.before,
      minViews: filters.minViews,
    }
  }

  async function search(e) {
    e?.preventDefault()
    if (!filters.q.trim()) return
    setTab('search')
    setLoading(true)
    setError('')
    try {
      const { results, nextPageToken } = await api.youtube.viralVideos(baseParams())
      setResults(results)
      setNextPageToken(nextPageToken)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  // "Ver mais": pagina a mesma busca e acumula, deduplicando por id (máx. 100).
  async function loadMore() {
    if (!nextPageToken || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const { results: more, nextPageToken: next } = await api.youtube.viralVideos({ ...baseParams(), pageToken: nextPageToken })
      setResults((prev) => {
        const seen = new Set((prev || []).map((v) => v.id))
        return [...(prev || []), ...more.filter((v) => !seen.has(v.id))].slice(0, MAX_VIRAL)
      })
      setNextPageToken(next)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <PrivacyScope page="videos-virais">
    <div className="mx-auto max-w-[1500px] space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <TrendingUp size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{t('viral.title')}</h1>
            <p className="text-sm text-slate-500">{t('viral.subtitle')}</p>
          </div>
        </div>
        <PageEye />
      </div>

      {/* Filtros de busca */}
      <form onSubmit={search} className="rounded-xl border border-t-2 border-slate-800 border-t-cyan-500/60 bg-slate-900/40 p-5">
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <SlidersHorizontal size={15} className="text-cyan-400" />
          {t('viral.filtersTitle')}
        </p>

        <Field label={t('viral.keywords')}>
          <input
            className={inputCls}
            required
            placeholder={t('viral.keywordsPlaceholder')}
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
          />
        </Field>

        <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3.5 py-2.5 text-xs text-slate-400">
          💡 <b className="text-slate-300">{t('viral.tipLabel')}</b> {t('viral.tipText')}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t('viral.publishedIn')}>
            <select className={inputCls} value={filters.period} onChange={(e) => set('period', e.target.value)}>
              {PERIOD_KEYS.map(([v, k]) => (
                <option key={v} value={v}>
                  {t(`viral.periods.${k}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('viral.minDuration')}>
            <input className={inputCls} type="number" min="0" value={filters.durMinSec} onChange={(e) => set('durMinSec', e.target.value)} />
          </Field>
          <Field label={t('viral.publishedAfter')}>
            <input className={inputCls} type="date" value={filters.after} onChange={(e) => set('after', e.target.value)} />
          </Field>
          <Field label={t('viral.publishedBefore')}>
            <input className={inputCls} type="date" value={filters.before} onChange={(e) => set('before', e.target.value)} />
          </Field>
          <Field label={t('viral.minViews')}>
            <input className={inputCls} type="number" min="0" placeholder={t('viral.minViewsPlaceholder')} value={filters.minViews} onChange={(e) => set('minViews', e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={loading} className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {t('viral.searchBtn')}
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
            {t('viral.clearFilters')}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3.5 py-2.5 text-xs text-slate-400">
          <p>
            <TrendingUp size={12} className="mr-1.5 inline text-cyan-400" />
            <b className="text-cyan-300">{t('viral.smartSearchLabel')}</b> {t('viral.smartSearchText')}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">{t('viral.scoreNote')}</p>
        </div>
      </form>

      {/* Abas */}
      <div className="flex gap-1 border-b border-slate-800">
        <TabBtn active={tab === 'search'} onClick={() => setTab('search')} icon={<Search size={13} />} label={t('viral.tabSearch')} />
        <TabBtn active={tab === 'saved'} onClick={() => setTab('saved')} icon={<Bookmark size={13} />} label={t('viral.tabSaved', { n: saved.length })} />
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {tab === 'search' && (
        <>
          {loading && (
            <div className="flex flex-col items-center py-16">
              <Loader2 size={28} className="animate-spin text-cyan-400" />
              <p className="mt-3 text-sm text-slate-500">{t('viral.calculating')}</p>
            </div>
          )}

          {!loading && results === null && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-6 py-16 text-center">
              <div className="text-5xl">🎯</div>
              <p className="mt-5 text-lg font-bold text-slate-100">{t('viral.readyTitle')}</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{t('viral.readyDesc')}</p>
              <div className="mx-auto mt-8 flex w-fit max-w-full flex-wrap justify-center gap-4 rounded-xl border border-slate-800 bg-slate-950 px-4 py-4 sm:gap-8 sm:px-8">
                <MiniFeature icon={<Search size={18} className="text-cyan-400" />} label={t('viral.featSearch')} />
                <MiniFeature icon={<BarChart3 size={18} className="text-emerald-400" />} label={t('viral.featMetrics')} />
                <MiniFeature icon={<Target size={18} className="text-red-400" />} label={t('viral.featOpp')} />
              </div>
            </div>
          )}

          {!loading && results !== null && <ResultsGrid videos={results} />}

          {!loading && results !== null && results.length > 0 && nextPageToken && results.length < MAX_VIRAL && (
            <div className="flex justify-center pb-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-6 py-2.5 text-sm font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:opacity-60"
              >
                {loadingMore ? <Loader2 size={15} className="animate-spin" /> : <TrendingUp size={15} />}
                {loadingMore ? t('viral.loadingMore') : t('viral.seeMore')}
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'saved' &&
        (saved.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 px-6 py-16 text-center">
            <Bookmark size={26} className="mx-auto text-slate-600" />
            <p className="mt-3 text-sm text-slate-500">{t('viral.noSaved')}</p>
          </div>
        ) : (
          <ResultsGrid videos={saved.map((s) => s.video)} />
        ))}
    </div>
    </PrivacyScope>
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

const SORT_KEYS = ['views', 'vph', 'engagement', 'viralScore', 'newest']

// Insights automáticos do vídeo (como o hover ℹ️ do original): avalia sempre
// engajamento e aprovação, marcando POSITIVO ou NEGATIVO conforme os limiares —
// vídeo com número ruim recebe alerta, não elogio.
function insightsFor(v, t) {
  const out = []
  const ageDays = Math.max(1, Math.round((Date.now() - new Date(v.publishedAt).getTime()) / 86_400_000))
  const perDay = Math.round(v.views / ageDays)
  const eng = v.engagement != null ? v.engagement : 0
  const likeRatio = v.views > 0 ? +((v.likes / v.views) * 100).toFixed(2) : 0
  const ins = (k) => `viral.insights.${k}`

  // Alcance vs. inscritos — o sinal mais forte de viral
  if (v.channelSubs > 0) {
    const ratio = +(v.views / v.channelSubs).toFixed(1)
    if (ratio >= 3) out.push({ emoji: '🔥', title: t(ins('reachExplosiveTitle')), text: t(ins('reachExplosiveText'), { ratio }) })
    else if (ratio < 0.5) out.push({ emoji: '🐢', title: t(ins('reachContainedTitle')), text: t(ins('reachContainedText'), { ratio }) })
  }

  // Ritmo de crescimento
  if (v.vph >= 5000) out.push({ emoji: '🚀', title: t(ins('fastGrowthTitle')), text: t(ins('fastGrowthText'), { vph: formatCompact(v.vph) }) })
  else if (v.vph < 100 && ageDays < 30) out.push({ emoji: '📉', title: t(ins('slowGrowthTitle')), text: t(ins('slowGrowthText'), { vph: formatCompact(v.vph) }) })

  // Evergreen (vídeo antigo que continua rendendo)
  if (ageDays > 180 && perDay > 1000) out.push({ emoji: '♻️', title: t(ins('evergreenTitle')), text: t(ins('evergreenText'), { days: ageDays, perDay: formatCompact(perDay) }) })

  // Engajamento — sempre avaliado (positivo ou negativo)
  if (eng >= 2) out.push({ emoji: '✅', title: t(ins('highEngTitle')), text: t(ins('highEngText'), { eng }) })
  else out.push({ emoji: '⚠️', title: t(ins('lowEngTitle')), text: t(ins('lowEngText'), { eng }) })

  // Aprovação (like ratio) — sempre avaliada
  if (likeRatio >= 2) out.push({ emoji: '👍', title: t(ins('goodApprovalTitle')), text: t(ins('goodApprovalText'), { ratio: likeRatio }) })
  else out.push({ emoji: '👎', title: t(ins('lowApprovalTitle')), text: t(ins('lowApprovalText'), { ratio: likeRatio }) })

  return out
}

function ResultsGrid({ videos }) {
  const db = useDb()
  const { t } = useI18n()
  const restricted = useRestricted()
  const saved = db.all('savedViralVideos')
  const [sort, setSort] = useState('views')
  const [desc, setDesc] = useState(true)

  function toggleSave(video) {
    const existing = saved.find((s) => s.video.id === video.id)
    if (existing) db.remove('savedViralVideos', existing.id)
    else db.insert('savedViralVideos', { video })
  }

  function fmtDuration(s) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = String(s % 60).padStart(2, '0')
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
  }

  // Score Viral™ do original: 🔥 alto (60+), ⚡ médio (30-59), 😐 baixo
  function scoreBadge(score) {
    if (score == null) return { emoji: '😐', cls: 'text-slate-500' }
    if (score >= 60) return { emoji: '🔥', cls: 'text-green-400' }
    if (score >= 30) return { emoji: '⚡', cls: 'text-amber-400' }
    return { emoji: '😐', cls: 'text-red-400' }
  }

  if (videos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-800 px-6 py-14 text-center">
        <Lightbulb size={24} className="mx-auto text-slate-600" />
        <p className="mt-3 text-sm text-slate-500">{t('viral.nothingFound')}</p>
      </div>
    )
  }

  const sorted = [...videos].sort((a, b) => {
    const val = (v) => (sort === 'newest' ? new Date(v.publishedAt).getTime() : v[sort] ?? 0)
    return desc ? val(b) - val(a) : val(a) - val(b)
  })

  return (
    <div className="space-y-4">
      {/* Contagem + ordenação, como no original */}
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-lg font-bold text-slate-100">
          {videos.length} <span className="font-normal text-slate-400">{t('viral.found')}</span>
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">{t('viral.sortLabel')}</span>
          <select className={`${inputCls} !h-8 !w-44 !py-1 !text-xs`} value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_KEYS.map((v) => (
              <option key={v} value={v}>
                {t(`viral.sorts.${v}`)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setDesc((d) => !d)}
            title={desc ? t('viral.highFirst') : t('viral.lowFirst')}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-700"
          >
            {desc ? '↓' : '↑'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {sorted.map((v) => {
          const isSaved = saved.some((s) => s.video.id === v.id)
          const badge = scoreBadge(v.viralScore)
          return (
            <div key={v.id} className="relative rounded-xl border border-slate-800 bg-slate-900/40 transition-colors hover:z-20 hover:border-cyan-500/40">
              {/* Thumb — no modo restrito vira "?" (a imagem nem é carregada) */}
              <div className="relative overflow-hidden rounded-t-xl">
                <RestrictedThumb src={v.thumbnail} className="aspect-video w-full object-cover" qClass="text-3xl" />
                <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {fmtDuration(v.durationSeconds)}
                </span>
              </div>
              <div className="p-3">
                <a
                  href={`https://youtube.com/watch?v=${v.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-2 min-h-[2.4rem] text-[13px] font-semibold leading-snug text-slate-100 hover:text-cyan-300"
                >
                  <Masked mask="•••••••••••">{v.title}</Masked>
                </a>
                <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                  <Masked mask="•••••••">{v.channelTitle}</Masked>
                  <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-300">
                    <Masked mask="••">{formatCompact(v.channelSubs)}</Masked>
                  </span>
                </p>

                {/* Grade de métricas: Views / Likes / Coment. */}
                <div className="mt-2 grid grid-cols-3 gap-1">
                  <MetricCell label={t('viral.metricViews')} value={<Masked mask="••">{formatCompact(v.views)}</Masked>} cls="border-sky-500/15 bg-sky-500/10 text-sky-400" />
                  <MetricCell label={t('viral.metricLikes')} value={<Masked mask="••">{formatCompact(v.likes ?? 0)}</Masked>} cls="border-green-500/15 bg-green-500/10 text-green-400" />
                  <MetricCell label={t('viral.metricComments')} value={<Masked mask="••">{formatCompact(v.comments ?? 0)}</Masked>} cls="border-cyan-500/15 bg-cyan-500/10 text-cyan-400" />
                </div>
                {/* VPH / Engaj. */}
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <MetricCell label={t('viral.metricVph')} value={<Masked mask="••">{formatCompact(v.vph)}</Masked>} cls="border-cyan-500/15 bg-cyan-500/10 text-emerald-400" />
                  <MetricCell label={t('viral.metricEng')} value={<Masked mask="••">{v.engagement != null ? `${v.engagement}%` : '—'}</Masked>} cls="border-amber-500/15 bg-amber-500/10 text-amber-400" />
                </div>
                {/* Score Viral™ / Data de Publicação */}
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <div className="group/ins relative rounded-md border border-cyan-500/20 bg-cyan-500/5 px-2 py-1.5">
                    <p className="cursor-help text-[9px] font-medium text-slate-500">{t('viral.scoreViralLabel')}</p>
                    <p className="text-center text-base font-extrabold">
                      <span className="mr-1">{badge.emoji}</span>
                      <span className={badge.cls}><Masked mask="••">{v.viralScore ?? '—'}</Masked></span>
                    </p>
                    {!restricted && (
                      <div className="pointer-events-none absolute bottom-full left-0 right-0 z-50 mb-2 hidden max-h-[60vh] overflow-y-auto rounded-xl border border-cyan-500/40 bg-slate-950/98 p-3 shadow-2xl group-hover/ins:block">
                        <p className="mb-2 border-b border-slate-800 pb-1.5 text-[11px] font-bold text-slate-200">{t('viral.insightsTitle')}</p>
                        <div className="space-y-1.5">
                          {insightsFor(v, t).map((ins, i) => (
                            <div key={i} className="rounded-md border border-white/10 bg-white/[0.04] p-2">
                              <p className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-200">
                                <span>{ins.emoji}</span>
                                {ins.title}
                              </p>
                              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{ins.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-md border border-cyan-500/20 bg-cyan-500/5 px-2 py-1.5">
                    <p className="text-[9px] font-medium text-slate-500">{t('viral.pubDate')}</p>
                    <p className="text-[11px] font-semibold text-cyan-300">📅 {new Date(v.publishedAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>

                {/* Ações: Salvar / Ver / Canal */}
                <div className="mt-2 flex gap-1">
                  <button
                    onClick={() => toggleSave(v)}
                    className={`flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      isSaved ? 'bg-green-500/10 text-green-400' : 'bg-cyan-500 text-white hover:bg-cyan-600'
                    }`}
                  >
                    {isSaved ? <Trash2 size={11} /> : <Bookmark size={11} />}
                    {isSaved ? t('viral.remove') : t('viral.save')}
                  </button>
                  <a
                    href={`https://youtube.com/watch?v=${v.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-cyan-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-cyan-600"
                  >
                    {t('viral.watch')}
                  </a>
                  <a
                    href={`https://youtube.com/channel/${v.channelId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    <ExternalLink size={11} />
                    {t('viral.channel')}
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MetricCell({ label, value, cls }) {
  return (
    <div className={`rounded-md border px-1.5 py-1 text-center ${cls}`}>
      <p className="text-[9px] font-medium text-slate-500">{label}</p>
      <p className="truncate text-[11px] font-bold">{value}</p>
    </div>
  )
}
