import { useState } from 'react'
import { Search, Loader2, Image as ImageIcon, Film, Download, X, Sparkles } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { useI18n } from '../i18n'
import { inputCls, btnPrimary, btnGhost } from '../components/ui'

// Layout do original: pílulas Imagens/Vídeos, busca, FONTES (Pexels/Pixabay
// multi-seleção) e ORIENTAÇÃO (Horizontal/Vertical/Quadrada/Todas).
const ORIENTATION_KEYS = ['horizontal', 'vertical', 'square', 'all']

const pill = (active) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? 'border-cyan-500 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white'
      : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200'
  }`

export default function MediaBank() {
  const { t } = useI18n()
  const [type, setType] = useState('image')
  const [query, setQuery] = useState('')
  const [orientation, setOrientation] = useState('all')
  const [sources, setSources] = useState({ Pexels: true, Pixabay: true })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [preview, setPreview] = useState(null)

  // overrides evita o estado defasado: ao clicar em Imagens/Vídeos ou numa
  // orientação, o valor novo chega direto (setState é assíncrono).
  async function search(e, overrides = {}) {
    e?.preventDefault()
    const t = overrides.type || type
    const o = overrides.orientation || orientation
    const qy = overrides.q != null ? overrides.q : query.trim()
    setLoading(true)
    setError('')
    try {
      const { results } = await api.media.search({ type: t, q: qy, orientation: o })
      setResults(results)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function toggleSource(name) {
    setSources((s) => {
      const next = { ...s, [name]: !s[name] }
      // pelo menos uma fonte sempre ativa
      return next.Pexels || next.Pixabay ? next : s
    })
  }

  function resBadge(item) {
    const w = item.width || 0
    if (w >= 3840) return '4K'
    if (w >= 1920) return 'HD'
    return 'SD'
  }

  const visible = (results || []).filter((r) => sources[r.source])

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      {/* Cabeçalho como no original */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('media.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('media.subtitle')}</p>
      </div>

      <form onSubmit={search} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        {/* Tipo + busca + Buscar */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setType('image'); if (results) search(null, { type: 'image' }) }} className={pill(type === 'image')}>
            <ImageIcon size={13} />
            {t('media.images')}
          </button>
          <button type="button" onClick={() => { setType('video'); if (results) search(null, { type: 'video' }) }} className={pill(type === 'video')}>
            <Film size={13} />
            {t('media.videos')}
          </button>
          <div className="relative min-w-48 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className={`${inputCls} !pl-9`}
              placeholder={t('media.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="submit" className={`${btnPrimary} flex min-w-32 items-center justify-center gap-2`} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            {t('media.searchBtn')}
          </button>
        </div>

        {/* Fontes + Orientação */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider text-slate-500">{t('media.sources')}</span>
            {['Pexels', 'Pixabay'].map((name) => (
              <button key={name} type="button" onClick={() => toggleSource(name)} className={pill(sources[name])}>
                {name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider text-slate-500">{t('media.orientation')}</span>
            {ORIENTATION_KEYS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setOrientation(v)
                  if (results) search(null, { orientation: v })
                }}
                className={pill(orientation === v)}
              >
                {t(`media.orientations.${v}`)}
              </button>
            ))}
          </div>
        </div>
      </form>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {results === null && !loading && !error && (
        <div className="rounded-xl border border-dashed border-slate-800 px-6 py-16 text-center">
          <ImageIcon size={26} className="mx-auto text-slate-600" />
          <p className="mt-4 font-semibold text-slate-200">{t('media.emptyTitle')}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t('media.emptyDesc')}</p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center py-16">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
        </div>
      )}

      {results !== null && !loading && (
        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <button key={item.id} onClick={() => setPreview(item)} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              {/* proporção real do item — vertical fica em pé, quadrada fica 1:1 */}
              <img
                src={item.thumb}
                alt=""
                style={{ aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : '16 / 9' }}
                className="w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{resBadge(item)}</span>
              <span className="absolute right-2 top-2 rounded bg-cyan-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.source}</span>
              {item.type === 'video' && (
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {item.duration ? `${item.duration}s` : t('media.videoLabel')}
                </span>
              )}
            </button>
          ))}
          {visible.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-slate-800 px-6 py-14 text-center">
              <Search size={22} className="mx-auto text-slate-600" />
              <p className="mt-3 text-sm text-slate-500">{t('media.nothingFound')}</p>
            </div>
          )}
        </div>
      )}

      {preview && (
        <PreviewModal
          item={preview}
          onClose={() => setPreview(null)}
          onSimilar={(kw) => {
            const q = (kw || '').split(',')[0].trim().split(/\s+/).slice(0, 4).join(' ') // 1as palavras da descrição/tags
            setPreview(null)
            setQuery(q)
            search(null, { q })
          }}
        />
      )}
    </div>
  )
}

// Nome amigável do arquivo p/ o download (sem barras/acentos estranhos).
function safeName(item, file) {
  const base = (item.title || item.source || 'midia').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'midia'
  const ext = item.type === 'video' ? 'mp4' : (String(file?.url || '').match(/\.(jpe?g|png|webp)(\?|$)/i)?.[1] || 'jpg')
  return `noctis-${base}-${String(item.id).replace(/[^a-z0-9-]/gi, '')}.${ext.toLowerCase()}`
}

function PreviewModal({ item, onClose, onSimilar }) {
  const { t } = useI18n()
  const [file, setFile] = useState(item.files?.[0])
  const [downloading, setDownloading] = useState(false)
  const canSimilar = !!(item.keywords && item.keywords.trim())

  // Baixa DE VERDADE no PC (com diálogo de "onde salvar" do navegador): busca o
  // arquivo como blob e força o download. Se o CORS bloquear, abre em nova aba.
  async function download() {
    if (!file?.url || downloading) return
    setDownloading(true)
    try {
      const res = await fetch(file.url)
      if (!res.ok) throw new Error('http')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = safeName(item, file)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch {
      window.open(file.url, '_blank', 'noopener,noreferrer') // fallback (CORS)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" onClick={onClose}>
      <div className="max-h-full w-full max-w-[1040px] overflow-y-auto rounded-xl border border-slate-800 bg-slate-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-cyan-500/15 px-2 py-0.5 text-[11px] font-bold text-cyan-400">{item.source}</span>
            <span className="truncate text-sm font-medium text-slate-200">{item.title || '—'}</span>
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-500 hover:text-slate-300">
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center justify-center bg-black p-4">
          {item.type === 'video' ? (
            <video src={file?.url} poster={item.thumb} controls className="max-h-[60vh] w-full rounded-lg" />
          ) : (
            <img src={file?.url || item.thumb} alt="" className="max-h-[60vh] rounded-lg object-contain" />
          )}
        </div>
        {item.author && <p className="px-5 pt-3 text-xs text-slate-500">{t('media.by', { author: item.author })}</p>}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {(item.files || []).map((f, i) => (
              <button
                key={i}
                onClick={() => setFile(f)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  file === f ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                {f.label}
                {f.width ? ` · ${f.width}px` : ''}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canSimilar && (
              <button onClick={() => onSimilar?.(item.keywords)} className={`${btnGhost} flex items-center gap-2`} title={t('media.similarHint')}>
                <Sparkles size={15} />
                {t('media.similar')}
              </button>
            )}
            <button onClick={download} disabled={downloading} className={`${btnPrimary} flex items-center gap-2`}>
              {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {t('media.download')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
