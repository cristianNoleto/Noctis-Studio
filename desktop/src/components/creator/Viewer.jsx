import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Star, Copy, Pencil, Wand2, Trash2, FolderOpen, Puzzle, History } from 'lucide-react'
import { call, useToast } from '../../lib/api'
import { mediaUrl, isVideo, modelLabel, quando } from '../../lib/media'

// Visualizador em tela cheia: ← → navegam, Esc fecha.
export default function Viewer({ jobs, inicial, onClose, onAction, volume }) {
  const toast = useToast()
  const [i, setI] = useState(Math.max(0, jobs.findIndex((j) => j.id === inicial)))
  const [arq, setArq] = useState(0)
  const [hist, setHist] = useState(false)
  const job = jobs[i]
  useEffect(() => { setArq(0) }, [i])
  useEffect(() => {
    const k = (e) => {
      if (e.target.matches('input, textarea')) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((x) => Math.min(jobs.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [jobs.length, onClose])
  if (!job) return null
  const f = job.files[arq] || job.files[0]
  const conta = job.account_id ? `${job.account_id.split('@')[0].slice(0, 4)}***` : ''

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95">
      <div className="flex items-center gap-2 px-5 py-3 text-xs">
        <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">{i + 1} / {jobs.length}</span>
        <span className="rounded-md bg-cyan-500/15 px-2 py-1 font-bold text-cyan-300">#{job.seq}</span>
        {job.kind !== 'upload' && <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">{modelLabel(job)}</span>}
        {job.params?.aspect && <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">{job.params.aspect}</span>}
        {job.kind === 'video' && <span className="rounded-md bg-violet-500/15 px-2 py-1 text-violet-300">{job.parent_id || job.params?.startImage ? 'frames → vídeo' : job.params?.mode === 'elements' ? 'elementos' : 'texto → vídeo'}</span>}
        {conta && <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-400">conta {conta}</span>}
        <span className="text-slate-500">{quando(job.finished_at || job.created_at)}</span>
        <div className="flex-1" />
        <button className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16">
        <button disabled={i === 0} onClick={() => setI(i - 1)} className="absolute left-4 rounded-full bg-slate-900/80 p-3 text-slate-200 disabled:opacity-20"><ChevronLeft size={22} /></button>
        {f && (isVideo(f)
          ? <video key={f} src={mediaUrl(f)} autoPlay loop controls className="max-h-full max-w-full rounded-lg" onLoadedData={(e) => { e.currentTarget.volume = volume ?? 0.6 }} />
          : <img src={mediaUrl(f)} className="max-h-full max-w-full rounded-lg object-contain" alt="" />)}
        <button disabled={i === jobs.length - 1} onClick={() => setI(i + 1)} className="absolute right-4 rounded-full bg-slate-900/80 p-3 text-slate-200 disabled:opacity-20"><ChevronRight size={22} /></button>
      </div>
      <div className="mx-auto w-full max-w-4xl px-6 pb-5 pt-3">
        {job.files.length > 1 && (
          <div className="mb-3 flex justify-center gap-2">
            {job.files.map((x, n) => <button key={x} onClick={() => setArq(n)} className={`h-12 w-20 overflow-hidden rounded-md border ${n === arq ? 'border-cyan-400' : 'border-slate-700'}`}>{isVideo(x) ? <video src={mediaUrl(x)} muted className="h-full w-full object-cover" /> : <img src={mediaUrl(x)} className="h-full w-full object-cover" alt="" />}</button>)}
          </div>
        )}
        <div className="mb-3 flex flex-wrap justify-center gap-1.5">
          {[
            [Star, job.favorite ? 'Desfavoritar' : 'Favoritar', 'favorite'],
            [Copy, 'Copiar prompt', 'copy'],
            [Pencil, 'Reusar prompt', 'reuse'],
            ...(job.kind === 'image' || job.kind === 'upload' ? [[Wand2, 'Animar', 'animate']] : []),
            [Puzzle, 'Ingrediente', 'ingredient'],
            [FolderOpen, 'Mostrar na pasta', 'reveal'],
            ...(job.rewrites?.length ? [[History, `Reescritas (${job.rewrites.length})`, 'history']] : []),
            [Trash2, 'Excluir', 'delete'],
          ].map(([Icon, rot, a]) => (
            <button key={a} onClick={async () => {
              if (a === 'copy') { await navigator.clipboard.writeText(job.original_prompt || job.prompt); toast('Prompt copiado.', 'success'); return }
              if (a === 'history') { setHist(!hist); return }
              onAction(job, a)
            }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100">
              <Icon size={13} className={a === 'favorite' && job.favorite ? 'text-amber-400' : ''} /> {rot}
            </button>
          ))}
        </div>
        <p data-selectable className="max-h-28 overflow-y-auto text-center text-[13px] leading-relaxed text-slate-300">{job.kind === 'upload' ? job.prompt : job.prompt}</p>
        {hist && (
          <div className="mt-3 space-y-1.5 rounded-xl border border-slate-800 bg-slate-950 p-3">
            {job.rewrites.map((r, n) => (
              <div key={n} className="text-xs"><span className="font-bold text-amber-300">v{n + 1}</span> <span className="text-slate-400">{r.prompt}</span><p className="text-red-300/80">↳ {r.error}</p></div>
            ))}
            <div className="text-xs"><span className="font-bold text-emerald-300">v{job.rewrites.length + 1}</span> <span className="text-slate-300">{job.prompt}</span></div>
          </div>
        )}
      </div>
    </div>
  )
}
