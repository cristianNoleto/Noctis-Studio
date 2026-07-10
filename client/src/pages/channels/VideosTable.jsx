import { useEffect, useRef, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import {
  Plus,
  Pencil,
  FileText,
  Link2,
  Trash2,
  Loader2,
  Sparkles,
  Film,
  Search,
  List,
  LayoutGrid,
  ArrowUpDown,
  Check,
  ExternalLink,
  DownloadCloud,
  Calendar,
} from 'lucide-react'
import { useDb } from '../../lib/db'
import { api, apiErrorMessage } from '../../lib/api'
import { importChannelVideos } from '../../lib/importVideos'
import { Modal, inputCls, btnPrimary, btnGhost, ScoreRing, ConfirmDialog, EmptyState } from '../../components/ui'
import { Masked, RestrictedThumb } from '../../components/privacy'
import { Field } from './ChannelsList'
import ScriptDrawer from './ScriptDrawer'

const TABS = [
  ['all', 'Todos'],
  ['planning', 'Planejamento'],
  ['production', 'Produção'],
  ['finished', 'Finalizado'],
  ['scheduled_published', 'Agendado/Publicado'],
]

const STATUS_OPTIONS = [
  ['planning', 'Planejamento'],
  ['production', 'Produção'],
  ['finished', 'Finalizado'],
  ['scheduled', 'Agendado'],
  ['published', 'Publicado'],
]

export const STEPS = [
  ['titulo', 'Título'],
  ['roteiro', 'Roteiro'],
  ['audio', 'Áudio'],
  ['thumbnail', 'Thumbnail'],
  ['renderizado', 'Renderizado'],
  ['publicado', 'Publicado'],
]

function matchesTab(video, tab) {
  if (tab === 'all') return true
  if (tab === 'scheduled_published') return ['scheduled', 'published'].includes(video.status)
  return video.status === tab
}

export default function VideosTable({ channelId, channel }) {
  const db = useDb()
  const [view, setView] = useState('list')
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const [sortDesc, setSortDesc] = useState(true)
  const [editVideo, setEditVideo] = useState(null) // null | 'new' | video
  const [scriptVideo, setScriptVideo] = useState(null)
  const [linkVideo, setLinkVideo] = useState(null)
  const [reportVideo, setReportVideo] = useState(null)
  const [deleteVideo, setDeleteVideo] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [importError, setImportError] = useState('')

  const videos = db.all('videos').filter((v) => v.channelId === channelId)
  const counts = Object.fromEntries(TABS.map(([key]) => [key, videos.filter((v) => matchesTab(v, key)).length]))

  let filtered = videos.filter((v) => matchesTab(v, tab))
  if (query.trim()) filtered = filtered.filter((v) => v.title.toLowerCase().includes(query.trim().toLowerCase()))
  filtered = [...filtered].sort((a, b) => {
    const av = a.videoNumber ?? 0
    const bv = b.videoNumber ?? 0
    return sortDesc ? bv - av : av - bv
  })

  // -------------------------------------------------------------------
  // Importação dos vídeos já publicados no YouTube (todas as páginas)
  // -------------------------------------------------------------------
  async function importFromYoutube() {
    if (!channel?.youtubeChannelId || importing) return
    setImporting(true)
    setImportError('')
    try {
      const inserted = await importChannelVideos(channelId, channel.youtubeChannelId, setImportMsg)
      setImportMsg(inserted > 0 ? `${inserted} vídeo${inserted > 1 ? 's' : ''} importado${inserted > 1 ? 's' : ''} do YouTube ✓` : 'Nenhum vídeo novo para importar.')
      setTimeout(() => setImportMsg(''), 4000)
    } catch (err) {
      setImportError(apiErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  function toggleStep(video, key) {
    const steps = { ...(video.steps || {}), [key]: !video.steps?.[key] }
    db.update('videos', video.id, { steps })
  }

  // ------ Relatórios SEO em lote: analisa todos os vídeos sem relatório ------
  const [batch, setBatch] = useState(null) // { running, done, total, current, errors }
  const batchStop = useRef(false)

  const reportedIds = new Set(db.all('seoReports').map((r) => r.videoId))
  const pendingReports = videos.filter((v) => !reportedIds.has(v.id)).length

  async function analyzeAll() {
    if (batch?.running) {
      batchStop.current = true
      return
    }
    const targets = videos.filter((v) => !reportedIds.has(v.id))
    if (!targets.length) return
    batchStop.current = false
    setBatch({ running: true, done: 0, total: targets.length, current: targets[0].title, errors: 0 })
    for (let i = 0; i < targets.length; i++) {
      if (batchStop.current) break
      const v = targets[i]
      setBatch((b) => ({ ...b, done: i, current: v.title }))
      try {
        const data = await api.ai.seoReport({ title: v.title, description: v.description || '', tags: v.tags || [] })
        db.insert('seoReports', { videoId: v.id, score: data.score, report: data })
        setBatch((b) => ({ ...b, done: i + 1 }))
      } catch {
        setBatch((b) => ({ ...b, done: i + 1, errors: b.errors + 1 }))
      }
      // intervalo entre chamadas p/ respeitar o rate limit do free tier
      if (i < targets.length - 1 && !batchStop.current) await new Promise((r) => setTimeout(r, 4500))
    }
    setBatch((b) => ({ ...b, running: false, current: null }))
  }

  return (
    <div className="space-y-3">
      {/* Cabeçalho da seção */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-100">Títulos & Vídeos</h2>
          <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <ViewBtn active={view === 'list'} onClick={() => setView('list')} icon={<List size={12} />} label="Lista" />
            <ViewBtn active={view === 'kanban'} onClick={() => setView('kanban')} icon={<LayoutGrid size={12} />} label="Kanban" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                tab === key ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-700'
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
      </div>

      {/* Busca + ações */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={`${inputCls} !pl-9`} placeholder="Buscar títulos..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button
          onClick={() => setSortDesc((v) => !v)}
          title={sortDesc ? 'Mais recentes primeiro' : 'Mais antigos primeiro'}
          className="flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-3 text-slate-400 hover:border-slate-700"
        >
          <ArrowUpDown size={14} />
        </button>
        {channel?.youtubeChannelId && (
          <button onClick={importFromYoutube} disabled={importing} className={`${btnGhost} flex items-center gap-2 text-xs`}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
            {importing ? importMsg || 'Importando...' : 'Importar do YouTube'}
          </button>
        )}
        {videos.length > 0 && (
          <button
            onClick={analyzeAll}
            disabled={!batch?.running && pendingReports === 0}
            title={pendingReports === 0 && !batch?.running ? 'Todos os vídeos já têm relatório' : 'Gera relatório de SEO/CTR (IA) para todos os vídeos sem relatório'}
            className={`${btnGhost} flex items-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {batch?.running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {batch?.running ? 'Parar análise' : `Analisar todos (${pendingReports})`}
          </button>
        )}
        <button className={`${btnPrimary} flex items-center gap-1.5`} onClick={() => setEditVideo('new')}>
          <Plus size={15} />
          Novo Título
        </button>
      </div>

      {/* Progresso da análise em lote */}
      {batch && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="min-w-0 truncate text-slate-300">
              {batch.running ? (
                <>
                  Analisando <b className="text-cyan-300">{batch.current}</b>...
                </>
              ) : (
                <>
                  Análise em lote concluída — {batch.done - batch.errors} relatório{batch.done - batch.errors === 1 ? '' : 's'} gerado
                  {batch.done - batch.errors === 1 ? '' : 's'}
                  {batch.errors > 0 && <span className="text-amber-400"> · {batch.errors} com erro (cota da IA?)</span>}
                </>
              )}
            </span>
            <span className="ml-3 shrink-0 font-bold text-cyan-300">
              {batch.done}/{batch.total}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all" style={{ width: `${Math.round((batch.done / batch.total) * 100)}%` }} />
          </div>
        </div>
      )}

      {importMsg && !importing && <p className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-400">{importMsg}</p>}
      {importError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{importError}</p>}

      {/* Conteúdo */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Film}
          title="Nenhum vídeo aqui"
          description={
            channel?.youtubeChannelId
              ? 'Crie um título ou use "Importar do YouTube" para trazer os vídeos já publicados com thumb, data e link.'
              : 'Crie um título para começar o pipeline de produção deste canal.'
          }
        />
      ) : view === 'list' ? (
        <div className="space-y-2.5">
          {filtered.map((v) => (
            <VideoRow
              key={v.id}
              video={v}
              onToggleStep={(key) => toggleStep(v, key)}
              onEdit={() => setEditVideo(v)}
              onScript={() => setScriptVideo(v)}
              onReport={() => setReportVideo(v)}
              onLink={() => setLinkVideo(v)}
              onDelete={() => setDeleteVideo(v)}
            />
          ))}
        </div>
      ) : (
        <VideosKanban videos={filtered} onOpenScript={setScriptVideo} />
      )}

      {/* Modais */}
      <VideoFormModal open={editVideo !== null} onClose={() => setEditVideo(null)} channelId={channelId} video={editVideo === 'new' ? null : editVideo} nextNumber={Math.max(0, ...videos.map((v) => v.videoNumber || 0)) + 1} />
      <LinkYoutubeModal open={linkVideo !== null} onClose={() => setLinkVideo(null)} video={linkVideo} />
      <SeoReportModal open={reportVideo !== null} onClose={() => setReportVideo(null)} video={reportVideo} />
      {scriptVideo && <ScriptDrawer video={scriptVideo} onClose={() => setScriptVideo(null)} />}
      <ConfirmDialog
        open={deleteVideo !== null}
        onClose={() => setDeleteVideo(null)}
        onConfirm={() => {
          db.removeWhere('scripts', (s) => s.videoId === deleteVideo.id)
          db.remove('videos', deleteVideo.id)
        }}
        title="Excluir vídeo"
        message={`Excluir "${deleteVideo?.title}" apaga também o roteiro vinculado.`}
      />
    </div>
  )
}

function ViewBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ${active ? 'bg-cyan-500 text-white' : 'text-slate-500 hover:text-slate-300'}`}
    >
      {icon}
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Linha da lista (layout do print)
// ---------------------------------------------------------------------------
function StatusTag({ video }) {
  if (['published', 'scheduled'].includes(video.status)) {
    return <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">Agendado/Publicado</span>
  }
  const map = {
    planning: ['Planejamento', 'bg-slate-700/40 text-slate-300'],
    production: ['Produção', 'bg-amber-500/15 text-amber-400'],
    finished: ['Finalizado', 'bg-cyan-500/15 text-cyan-300'],
  }
  const [label, cls] = map[video.status] || map.planning
  return <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>
}

function VideoRow({ video: v, onToggleStep, onEdit, onScript, onReport, onLink, onDelete }) {
  const db = useDb()
  const report = db.all('seoReports').filter((r) => r.videoId === v.id).sort((a, b) => b.createdAt - a.createdAt)[0]

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 transition-colors hover:border-slate-700">
      {/* Thumb — no modo restrito vira "?" (a imagem nem é carregada) */}
      <div className="relative shrink-0">
        <RestrictedThumb
          src={v.thumbnailUrl}
          className="h-14 w-24 rounded-lg object-cover"
          loading="lazy"
          fallback={
            <div className="flex h-14 w-24 items-center justify-center rounded-lg bg-slate-800 text-slate-600">
              <Film size={18} />
            </div>
          }
        />
        {v.youtubeUrl && <span className="absolute bottom-1 right-1 rounded bg-red-500 px-1 text-[8px] font-bold text-white">▶</span>}
      </div>

      {/* Badges + data */}
      <div className="w-40 shrink-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {v.videoNumber != null && <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">Vídeo {v.videoNumber}</span>}
          <StatusTag video={v} />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          {v.publishedAt && (
            <span className="flex items-center gap-1">
              <Calendar size={9} />
              {new Date(v.publishedAt).toLocaleDateString('pt-BR')}
            </span>
          )}
          {v.imported && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">⬇ Importado</span>}
        </div>
      </div>

      {/* Título + etapas */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-100"><Masked mask="•••••••••••">{v.title}</Masked></p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {STEPS.map(([key, label]) => {
            const done = !!v.steps?.[key]
            return (
              <button
                key={key}
                onClick={() => onToggleStep(key)}
                title={done ? `${label}: concluído (clique para desmarcar)` : `${label}: pendente (clique para marcar)`}
                className={`flex items-center gap-1 text-[10px] transition-colors ${done ? 'text-green-400' : 'text-slate-600 hover:text-slate-400'}`}
              >
                <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${done ? 'border-green-500 bg-green-500/20' : 'border-slate-700'}`}>
                  {done && <Check size={9} />}
                </span>
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Score + ações */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button onClick={onReport} title="Relatório de SEO/CTR (IA)" className="flex items-center">
          <ScoreRing score={report?.score ?? null} size={34} />
        </button>
        <RowBtn title="Editar" onClick={onEdit}>
          <Pencil size={14} />
        </RowBtn>
        <RowBtn title="Roteiro" onClick={onScript}>
          <FileText size={14} />
        </RowBtn>
        {v.youtubeUrl ? (
          <a
            href={v.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-red-500/50 hover:text-red-400"
          >
            <ExternalLink size={11} />
            YouTube
          </a>
        ) : (
          <RowBtn title="Vincular URL do YouTube" onClick={onLink}>
            <Link2 size={14} />
          </RowBtn>
        )}
        <RowBtn title="Excluir" danger onClick={onDelete}>
          <Trash2 size={14} />
        </RowBtn>
      </div>
    </div>
  )
}

function RowBtn({ children, title, onClick, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        danger ? 'text-slate-500 hover:bg-red-500/10 hover:text-red-400' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Vista Kanban (arraste para mudar o status)
// ---------------------------------------------------------------------------
const KANBAN_COLUMNS = [
  ['planning', 'Planejamento', '#94a3b8'],
  ['production', 'Produção', '#f59e0b'],
  ['finished', 'Finalizado', '#00f2fe'],
  ['scheduled_published', 'Agendado/Publicado', '#4ade80'],
]

function VideosKanban({ videos, onOpenScript }) {
  const db = useDb()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function onDragEnd({ active, over }) {
    if (!over) return
    const status = over.id === 'scheduled_published' ? 'published' : over.id
    db.update('videos', active.id, { status })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {KANBAN_COLUMNS.map(([key, label, color]) => (
          <KanbanColumn key={key} id={key} label={label} color={color} videos={videos.filter((v) => matchesTab(v, key))} onOpenScript={onOpenScript} />
        ))}
      </div>
    </DndContext>
  )
}

function KanbanColumn({ id, label, color, videos, onOpenScript }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`min-h-72 w-72 shrink-0 rounded-xl border bg-slate-900/40 transition-colors ${isOver ? 'border-cyan-500/60 bg-cyan-500/5' : 'border-slate-800'}`}
    >
      <div className="flex items-center gap-2 border-b border-slate-800 px-3.5 py-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <p className="text-xs font-bold text-slate-200">{label}</p>
        <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{videos.length}</span>
      </div>
      <div className="space-y-2 p-2.5">
        {videos.map((v) => (
          <KanbanCard key={v.id} video={v} onOpenScript={onOpenScript} />
        ))}
      </div>
    </div>
  )
}

function KanbanCard({ video: v, onOpenScript }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: v.id })
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={`cursor-grab rounded-lg border border-slate-800 bg-slate-950 p-2.5 active:cursor-grabbing ${isDragging ? 'opacity-80 shadow-2xl' : ''}`}>
      {v.thumbnailUrl && <RestrictedThumb src={v.thumbnailUrl} className="mb-2 aspect-video w-full rounded object-cover" loading="lazy" />}
      <p className="line-clamp-2 text-xs font-medium leading-snug text-slate-200"><Masked mask="•••••••••••">{v.title}</Masked></p>
      <div className="mt-1.5 flex items-center justify-between">
        {v.videoNumber != null && <span className="text-[9px] text-slate-600">Vídeo {v.videoNumber}</span>}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpenScript(v)
          }}
          className="text-[10px] text-cyan-400 hover:underline"
        >
          Roteiro
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modais
// ---------------------------------------------------------------------------
function VideoFormModal({ open, onClose, channelId, video, nextNumber }) {
  const db = useDb()
  const [form, setForm] = useState({})

  useEffect(() => {
    if (open) {
      setForm({
        title: video?.title || '',
        thumbnailConcept: video?.thumbnailConcept || '',
        description: video?.description || '',
        postDate: video?.publishedAt ? String(video.publishedAt).slice(0, 10) : '',
        tags: (video?.tags || []).join(', '),
        thumbnailUrl: video?.thumbnailUrl || '',
        status: video?.status || 'planning',
      })
    }
  }, [open, video])

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function save(e) {
    e.preventDefault()
    const payload = {
      title: form.title,
      thumbnailConcept: form.thumbnailConcept || null,
      description: form.description,
      publishedAt: form.postDate ? `${form.postDate}T12:00:00Z` : video?.publishedAt || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      thumbnailUrl: form.thumbnailUrl || null,
      status: form.status,
    }
    if (video) db.update('videos', video.id, payload)
    else db.insert('videos', { channelId, ...payload, videoNumber: nextNumber, steps: { titulo: true } })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={video ? 'Editar Vídeo' : 'Novo Título/Vídeo'} wide>
      <p className="-mt-3 mb-5 text-xs text-slate-500">{video ? 'Atualize as informações do vídeo' : 'Criar um novo vídeo para o canal'}</p>
      <form onSubmit={save} className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-end justify-between">
            <label className="block text-xs font-semibold tracking-wide text-slate-400">TÍTULO *</label>
            <span className="text-[10px] text-slate-600">{(form.title || '').length}/100</span>
          </div>
          <input className={inputCls} required maxLength={100} placeholder="Digite o título do vídeo" value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
        </div>

        <div>
          <div className="mb-1.5 flex items-end justify-between">
            <label className="block text-xs font-semibold tracking-wide text-slate-400">THUMBNAIL</label>
            <span className="text-[10px] text-slate-600">{(form.thumbnailConcept || '').length}</span>
          </div>
          <input className={inputCls} placeholder="Descrição ou conceito da thumbnail" value={form.thumbnailConcept || ''} onChange={(e) => set('thumbnailConcept', e.target.value)} />
        </div>

        <div>
          <div className="mb-1.5 flex items-end justify-between">
            <label className="block text-xs font-semibold tracking-wide text-slate-400">DESCRIÇÃO</label>
            <span className="text-[10px] text-slate-600">{(form.description || '').length}/5000</span>
          </div>
          <textarea className={`${inputCls} min-h-24 resize-y`} maxLength={5000} placeholder="Descrição do vídeo..." value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div>
          <Field label="DATA DE POSTAGEM">
            <input className={inputCls} type="date" value={form.postDate || ''} onChange={(e) => set('postDate', e.target.value)} />
          </Field>
          <p className="mt-1 text-[10px] text-slate-600">Deixe vazio para definir automaticamente ao marcar como Agendado/Publicado</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="TAGS (separadas por vírgula)">
            <input className={inputCls} value={form.tags || ''} onChange={(e) => set('tags', e.target.value)} />
          </Field>
          <Field label="STATUS">
            <select className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUS_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="URL DA THUMBNAIL (opcional)">
          <input className={inputCls} value={form.thumbnailUrl || ''} onChange={(e) => set('thumbnailUrl', e.target.value)} placeholder="https://..." />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            {video ? '💾 Salvar' : '💾 Criar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function LinkYoutubeModal({ open, onClose, video }) {
  const db = useDb()
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (open) setUrl(video?.youtubeUrl || '')
  }, [open, video])

  function save(e) {
    e.preventDefault()
    db.update('videos', video.id, {
      youtubeUrl: url.trim(),
      status: 'published',
      steps: { ...(video.steps || {}), publicado: true },
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Vincular URL do YouTube">
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-500">Cole a URL definitiva do vídeo publicado. O status muda automaticamente para "Publicado".</p>
        <input className={inputCls} required type="url" placeholder="https://youtube.com/watch?v=..." value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Vincular
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Relatório de SEO/CTR por IA — resultado cacheado localmente
function SeoReportModal({ open, onClose, video }) {
  const db = useDb()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const report = video ? db.all('seoReports').filter((r) => r.videoId === video.id).sort((a, b) => b.createdAt - a.createdAt)[0] : null

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const data = await api.ai.seoReport({ title: video.title, description: video.description || '', tags: video.tags || [] })
      db.insert('seoReports', { videoId: video.id, score: data.score, report: data })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Relatório de SEO/CTR" wide>
      {!report && !generating && (
        <div className="py-6 text-center">
          <p className="text-sm text-slate-500">A IA analisa título, descrição e tags e devolve uma nota 0–100 com pontos fortes, fracos e sugestões.</p>
          <button className={`${btnPrimary} mt-4 inline-flex items-center gap-2`} onClick={generate}>
            <Sparkles size={15} />
            Gerar relatório com IA
          </button>
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>
      )}
      {generating && (
        <div className="flex flex-col items-center py-10">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
          <p className="mt-3 text-sm text-slate-500">Analisando com IA...</p>
        </div>
      )}
      {report && !generating && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <ScoreRing score={report.score} size={64} />
            <div>
              <p className="font-semibold text-slate-100">{video?.title}</p>
              <p className="text-xs text-slate-500">Gerado em {new Date(report.createdAt).toLocaleString('pt-BR')}</p>
            </div>
            <button className={`${btnGhost} ml-auto !px-3 !py-1.5 text-xs`} onClick={generate}>
              Gerar novamente
            </button>
          </div>
          <ReportSection title="✅ PONTOS FORTES" items={report.report?.strengths} />
          <ReportSection title="⚠️ PONTOS FRACOS" items={report.report?.weaknesses} />
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">💡 SUGESTÕES</p>
            <div className="space-y-2 text-sm text-slate-300">
              {report.report?.suggestions?.title && <Suggestion label="Título" text={report.report.suggestions.title} />}
              {report.report?.suggestions?.thumbnail && <Suggestion label="Thumbnail" text={report.report.suggestions.thumbnail} />}
              {report.report?.suggestions?.description && <Suggestion label="Descrição" text={report.report.suggestions.description} />}
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}
    </Modal>
  )
}

function ReportSection({ title, items }) {
  if (!items?.length) return null
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-300">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Suggestion({ label, text }) {
  return (
    <div className="rounded-lg bg-slate-950 px-3 py-2">
      <span className="mr-2 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan-400">{label.toUpperCase()}</span>
      {text}
    </div>
  )
}
