import { useState } from 'react'
import { Image as ImageIcon, Film, Upload, Star, RefreshCw, Trash2, MoreVertical, TriangleAlert, Loader2, Clock, Download, RotateCcw, Pencil } from 'lucide-react'
import { mediaUrl, isVideo, STATUS_LABEL, ERRO_LABEL } from '../../lib/media'

// Card de uma mídia no grid do Creator.
export default function JobCard({ job, selecionado, mostrarDetalhes, volume, onOpen, onMenu, onSelect, onAction, onDragStart }) {
  const [idx, setIdx] = useState(0)
  const arquivo = job.files[idx] || job.files[0]
  const pronto = job.status === 'done' && arquivo
  const tipo = job.kind === 'upload' ? 'upload' : job.kind
  const Chip = tipo === 'video' ? Film : tipo === 'upload' ? Upload : ImageIcon
  const corChip = tipo === 'video' ? 'bg-violet-500/90' : tipo === 'upload' ? 'bg-amber-500/90' : 'bg-sky-500/90'

  return (
    <div
      draggable={!!pronto}
      onDragStart={(e) => onDragStart && onDragStart(e, job)}
      onClick={(e) => (e.ctrlKey || e.metaKey ? onSelect(job, true) : pronto ? onOpen(job) : null)}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e, job) }}
      className={`group relative aspect-video cursor-pointer overflow-hidden rounded-xl border bg-slate-900 transition-all ${selecionado ? 'border-cyan-400 ring-2 ring-cyan-400/50' : job.status === 'failed' ? 'border-red-500/40' : 'border-slate-800 hover:border-slate-600'}`}
    >
      {pronto ? (
        isVideo(arquivo)
          ? <video src={mediaUrl(arquivo)} muted={!volume} loop playsInline className="h-full w-full object-cover" onMouseEnter={(e) => { e.currentTarget.volume = volume || 0; e.currentTarget.play().catch(() => {}) }} onMouseLeave={(e) => { e.currentTarget.pause() }} />
          : <img src={mediaUrl(arquivo)} loading="lazy" className="h-full w-full object-cover" alt="" />
      ) : (
        <div className={`flex h-full flex-col items-center justify-center gap-2 px-4 text-center ${job.status === 'failed' ? 'bg-red-500/5' : ''}`}>
          {job.status === 'pending' && <><Clock size={20} className="text-slate-500" /><span className="text-xs text-slate-500">{job.pinned_account ? 'Esperando a conta voltar' : job.parent_id ? 'Esperando a imagem' : 'Aguardando'}</span></>}
          {(job.status === 'processing' || job.status === 'downloading') && <><Loader2 size={22} className="animate-spin text-cyan-400" /><span className="text-xs text-cyan-300">{STATUS_LABEL[job.status]}…</span></>}
          {job.status === 'failed' && <><TriangleAlert size={20} className="text-red-400" /><span className="text-xs font-semibold text-red-300">{ERRO_LABEL[job.error_cat] || 'Erro'}</span><span className="line-clamp-2 text-[11px] text-slate-500">{job.error}</span></>}
          {job.status === 'deleted' && <><Trash2 size={18} className="text-slate-500" /><span className="text-xs text-slate-500">Na lixeira</span></>}
        </div>
      )}

      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1">
        <span className={`flex h-5 w-5 items-center justify-center rounded-md ${corChip} text-white`}><Chip size={11} /></span>
        {job.params?.upscale && <span className="rounded-md bg-black/70 px-1.5 text-[10px] font-bold text-cyan-300">{job.params.upscale.toUpperCase()}</span>}
        {job.rewrites?.length > 0 && <span className="rounded-md bg-black/70 px-1.5 text-[10px] font-bold text-amber-300">{job.rewrites.length}x reescrito</span>}
        {job.favorite && <Star size={14} className="text-amber-400" fill="currentColor" />}
      </div>
      {job.files.length > 1 && pronto && (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-slate-200" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setIdx((idx - 1 + job.files.length) % job.files.length)}>‹</button>{idx + 1}/{job.files.length}<button onClick={() => setIdx((idx + 1) % job.files.length)}>›</button>
        </div>
      )}

      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        {job.status === 'failed' && <button className="rounded-lg bg-black/75 p-1.5 text-slate-200 hover:text-cyan-300" title="Tentar de novo" onClick={() => onAction(job, 'retry')}><RotateCcw size={13} /></button>}
        {job.status === 'failed' && <button className="rounded-lg bg-black/75 p-1.5 text-slate-200 hover:text-cyan-300" title="Editar prompt" onClick={() => onAction(job, 'edit')}><Pencil size={13} /></button>}
        {pronto && job.kind !== 'upload' && <button className="rounded-lg bg-black/75 p-1.5 text-slate-200 hover:text-cyan-300" title="Regenerar" onClick={() => onAction(job, 'regenerate')}><RefreshCw size={13} /></button>}
        {pronto && <button className="rounded-lg bg-black/75 p-1.5 text-slate-200 hover:text-cyan-300" title="Mostrar na pasta" onClick={() => onAction(job, 'reveal')}><Download size={13} /></button>}
        {job.status !== 'deleted' && <button className="rounded-lg bg-black/75 p-1.5 text-slate-200 hover:text-red-400" title="Excluir" onClick={() => onAction(job, 'delete')}><Trash2 size={13} /></button>}
        <button className="rounded-lg bg-black/75 p-1.5 text-slate-200" title="Mais" onClick={(e) => onMenu(e, job)}><MoreVertical size={13} /></button>
      </div>

      {mostrarDetalhes && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2.5 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
          <p className="line-clamp-2 text-[11px] text-slate-200"><span className="font-bold text-cyan-300">#{job.seq}</span> {job.kind === 'upload' ? job.prompt : job.original_prompt || job.prompt}</p>
        </div>
      )}
    </div>
  )
}
