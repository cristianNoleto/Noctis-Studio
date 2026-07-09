import { useState } from 'react'
import { Search, Loader2, Image as ImageIcon, Film, Download, X } from 'lucide-react'
import { api, apiErrorMessage } from '../lib/api'
import { inputCls, btnPrimary, EmptyState } from '../components/ui'

const ORIENTATIONS = [
  ['all', 'Todos'],
  ['horizontal', 'Horizontal'],
  ['vertical', 'Vertical'],
  ['square', 'Quadrado'],
]

export default function MediaBank() {
  const [type, setType] = useState('image')
  const [query, setQuery] = useState('')
  const [orientation, setOrientation] = useState('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState(null)
  const [preview, setPreview] = useState(null)

  async function search(e, overrideType) {
    e?.preventDefault()
    const t = overrideType || type
    setLoading(true)
    setError('')
    try {
      const { results } = await api.media.search({ type: t, q: query.trim(), orientation })
      setResults(results)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function resBadge(item) {
    const w = item.width || 0
    if (w >= 3840) return '4K'
    if (w >= 1920) return 'HD'
    return 'SD'
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Vídeos e Imagens</h1>
        <p className="mt-1 text-sm text-slate-500">Banco de mídia gratuito agregando Pexels e Pixabay (configure as chaves em Perfil → APIs).</p>
      </div>

      <form onSubmit={search} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            {[
              ['image', 'Imagens', ImageIcon],
              ['video', 'Vídeos', Film],
            ].map(([v, l, Icon]) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setType(v)
                  if (results) search(null, v)
                }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${type === v ? 'bg-cyan-500 text-white' : 'text-slate-400'}`}
              >
                <Icon size={13} />
                {l}
              </button>
            ))}
          </div>
          <div className="relative min-w-48 flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className={`${inputCls} !pl-9`} placeholder="Busque por tema (ex: dark forest, storm...)" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className={`${inputCls} !w-auto`} value={orientation} onChange={(e) => setOrientation(e.target.value)}>
            {ORIENTATIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button type="submit" className={`${btnPrimary} flex items-center gap-2`} disabled={loading}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Buscar
          </button>
        </div>
      </form>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {results === null && !loading && !error && (
        <EmptyState icon={ImageIcon} title="Busque mídia livre de direitos" description="Imagens e vídeos em 4K/HD do Pexels e Pixabay, prontos para seus vídeos dark." />
      )}

      {loading && (
        <div className="flex flex-col items-center py-16">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
        </div>
      )}

      {results !== null && !loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {results.map((item) => (
            <button key={item.id} onClick={() => setPreview(item)} className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
              <img src={item.thumb} alt="" className="aspect-video w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">{resBadge(item)}</span>
              <span className="absolute right-2 top-2 rounded bg-cyan-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.source}</span>
              {item.type === 'video' && (
                <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {item.duration ? `${item.duration}s` : 'vídeo'}
                </span>
              )}
            </button>
          ))}
          {results.length === 0 && (
            <div className="col-span-full">
              <EmptyState icon={Search} title="Nada encontrado" description="Tente outro termo (os bancos respondem melhor em inglês)." />
            </div>
          )}
        </div>
      )}

      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function PreviewModal({ item, onClose }) {
  const [file, setFile] = useState(item.files?.[0])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" onClick={onClose}>
      <div className="max-h-full w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-950" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-[11px] font-bold text-cyan-400">{item.source}</span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
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
          <a href={file?.url} target="_blank" rel="noopener noreferrer" download className={`${btnPrimary} ml-auto flex items-center gap-2`}>
            <Download size={15} />
            Baixar
          </a>
        </div>
      </div>
    </div>
  )
}
