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
  PlaySquare,
  DownloadCloud,
  Calendar,
  ZoomIn,
  Upload,
  Download,
  SquareCheckBig,
} from 'lucide-react'
import { useDb } from '../../lib/db'
import { api, apiErrorMessage } from '../../lib/api'
import { importChannelVideos } from '../../lib/importVideos'
import { deriveStatus, isPosted, REQUIRED_STEPS } from '../../lib/videoStatus'
import { Modal, inputCls, btnPrimary, btnGhost, ScoreRing, ConfirmDialog, EmptyState } from '../../components/ui'
import { Masked, RestrictedThumb } from '../../components/privacy'
import { Field } from './ChannelsList'
import ScriptDrawer from './ScriptDrawer'

// Comprime a imagem no navegador para caber leve no localStorage (base64):
// redimensiona para no máx. 320px de largura e salva em JPEG de baixa qualidade
// — o suficiente para reconhecer qual é a thumb, sem pesar.
function compressThumb(file, maxW = 320, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const TABS = [
  ['all', 'Todos'],
  ['planning', 'Planejamento'],
  ['production', 'Produção'],
  ['finished', 'Finalizado'],
  ['scheduled_published', 'Agendado/Publicado'],
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
  return deriveStatus(video) === tab
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
  const [publishConfirm, setPublishConfirm] = useState(null) // { video, missing[] }

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
    const turningOn = !video.steps?.[key]
    // Ao marcar "Publicado" com etapas faltando, pede confirmação (completar tudo).
    if (key === 'publicado' && turningOn) {
      const missing = REQUIRED_STEPS.filter(([s]) => !video.steps?.[s])
      if (missing.length) {
        setPublishConfirm({ video, missing })
        return
      }
    }
    const steps = { ...(video.steps || {}), [key]: turningOn }
    const patch = { steps }
    // Ao virar publicado sem data definida, agenda para agora (cai em postados após a data).
    if (key === 'publicado' && turningOn && !video.publishedAt) patch.publishedAt = new Date().toISOString()
    db.update('videos', video.id, patch)
  }

  // "Sim, completar" no modal: marca todas as etapas e publica.
  function confirmPublishAll() {
    const v = publishConfirm.video
    const steps = { titulo: true, roteiro: true, audio: true, thumbnail: true, renderizado: true, publicado: true }
    const patch = { steps }
    if (!v.publishedAt) patch.publishedAt = new Date().toISOString()
    db.update('videos', v.id, patch)
    setPublishConfirm(null)
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
      <PublishConfirmModal data={publishConfirm} onClose={() => setPublishConfirm(null)} onConfirm={confirmPublishAll} />
    </div>
  )
}

// Modal ao marcar "Publicado" com etapas faltando (layout do print).
function PublishConfirmModal({ data, onClose, onConfirm }) {
  if (!data) return null
  const missingLabels = data.missing.map(([, label]) => label).join(', ')
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-2xl border border-slate-800 bg-slate-900 p-7" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/12 text-sky-400">
          <SquareCheckBig size={22} />
        </div>
        <h3 className="mb-2 text-base font-semibold text-slate-100">Completar checklist</h3>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          Para marcar como "Agendado/Publicado", é necessário completar: {missingLabels}.
          <br />
          <br />
          Deseja marcar todas as etapas como concluídas agora?
        </p>
        <div className="flex justify-end gap-2.5">
          <button onClick={onClose} className="rounded-xl border border-slate-800 px-5 py-2 text-[13px] font-medium text-slate-400 transition-colors hover:bg-slate-800/50">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 px-5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Sim, completar
          </button>
        </div>
      </div>
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
  const map = {
    planning: ['Planejamento', 'bg-slate-700/40 text-slate-300'],
    production: ['Produção', 'bg-amber-500/15 text-amber-400'],
    finished: ['Finalizado', 'bg-cyan-500/15 text-cyan-300'],
    scheduled_published: ['Agendado/Publicado', 'bg-green-500/15 text-green-300'],
  }
  const [label, cls] = map[deriveStatus(video)] || map.planning
  return <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>
}

function VideoRow({ video: v, onToggleStep, onEdit, onScript, onReport, onLink, onDelete }) {
  const db = useDb()
  const report = db.all('seoReports').filter((r) => r.videoId === v.id).sort((a, b) => b.createdAt - a.createdAt)[0]
  const fileRef = useRef(null)
  const [zoom, setZoom] = useState(false)

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressThumb(file)
      db.update('videos', v.id, { thumbnailUrl: dataUrl })
    } catch {
      /* ignora arquivo inválido */
    }
  }

  function downloadThumb() {
    const a = document.createElement('a')
    a.href = v.thumbnailUrl
    a.download = `${(v.title || 'thumbnail').slice(0, 40)}.jpg`
    a.click()
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 transition-colors hover:border-slate-700">
      {/* Thumb — no modo restrito vira "?" (a imagem nem é carregada) */}
      <div className="group/thumb relative shrink-0">
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
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
        {/* Overlay de ações da thumbnail */}
        <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-black/70 opacity-0 transition-opacity group-hover/thumb:opacity-100">
          {v.thumbnailUrl ? (
            <>
              <ThumbBtn title="Visualizar" onClick={() => setZoom(true)}>
                <ZoomIn size={12} />
              </ThumbBtn>
              <ThumbBtn title="Substituir thumbnail" onClick={() => fileRef.current?.click()}>
                <Upload size={12} />
              </ThumbBtn>
              <ThumbBtn title="Baixar thumbnail" onClick={downloadThumb}>
                <Download size={12} />
              </ThumbBtn>
              <ThumbBtn title="Remover thumbnail" danger onClick={() => db.update('videos', v.id, { thumbnailUrl: null })}>
                <Trash2 size={12} />
              </ThumbBtn>
            </>
          ) : (
            <ThumbBtn title="Enviar thumbnail" onClick={() => fileRef.current?.click()}>
              <Upload size={12} />
            </ThumbBtn>
          )}
        </div>
        {zoom && v.thumbnailUrl && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6" onClick={() => setZoom(false)}>
            <img src={v.thumbnailUrl} alt="" className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
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

      {/* Score + ações (layout compacto do print) */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button onClick={onReport} title="Relatório de SEO/CTR (IA)" className="mr-0.5 text-sm font-bold text-cyan-400 transition-colors hover:text-cyan-300">
          {report?.score != null ? `${report.score}/100` : '—/100'}
        </button>
        <RowBtn title="Editar" onClick={onEdit}>
          <Pencil size={14} />
        </RowBtn>
        {v.youtubeUrl ? (
          <a
            href={v.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir no YouTube"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800 hover:text-red-400"
          >
            <PlaySquare size={15} />
          </a>
        ) : (
          <RowBtn title="Vincular URL do YouTube" onClick={onLink}>
            <Link2 size={14} />
          </RowBtn>
        )}
        <RowBtn title="Excluir" danger onClick={onDelete}>
          <Trash2 size={14} />
        </RowBtn>
        <button
          onClick={onScript}
          title="Roteiro"
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <FileText size={13} />
          Roteiro
        </button>
      </div>
    </div>
  )
}

function ThumbBtn({ children, title, onClick, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex items-center justify-center rounded p-1 transition-colors ${danger ? 'bg-red-500/30 text-red-300 hover:bg-red-500/50' : 'bg-white/15 text-white hover:bg-white/30'}`}
    >
      {children}
    </button>
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
    const v = db.get('videos', active.id)
    if (!v) return
    // Arrastar para uma coluna ajusta as etapas para bater com aquele estágio.
    const base = { titulo: true, roteiro: false, audio: false, thumbnail: false, renderizado: false, publicado: false }
    const steps = { ...base, ...(v.steps || {}), titulo: true }
    if (over.id === 'planning') Object.assign(steps, { roteiro: false, audio: false, thumbnail: false, renderizado: false, publicado: false })
    else if (over.id === 'production') Object.assign(steps, { roteiro: true, renderizado: false, publicado: false })
    else if (over.id === 'finished') Object.assign(steps, { roteiro: true, renderizado: true, publicado: false })
    else if (over.id === 'scheduled_published') Object.assign(steps, { roteiro: true, renderizado: true, publicado: true })
    const patch = { steps }
    if (over.id === 'scheduled_published' && !v.publishedAt) patch.publishedAt = new Date().toISOString()
    db.update('videos', active.id, patch)
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

        <Field label="TAGS (separadas por vírgula)">
          <input className={inputCls} value={form.tags || ''} onChange={(e) => set('tags', e.target.value)} />
        </Field>
        <Field label="URL DA THUMBNAIL (opcional)">
          <input className={inputCls} value={form.thumbnailUrl || ''} onChange={(e) => set('thumbnailUrl', e.target.value)} placeholder="https://... (ou use o upload na lista de vídeos)" />
        </Field>
        <p className="-mt-2 text-[10px] text-slate-600">O status (Planejamento → Produção → Finalizado → Agendado/Publicado) é automático, conforme as caixinhas de etapa marcadas.</p>
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
      publishedAt: video.publishedAt || new Date().toISOString(),
      steps: { ...(video.steps || {}), titulo: true, roteiro: true, audio: true, thumbnail: true, renderizado: true, publicado: true },
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
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-100">{video?.title}</p>
              <p className="text-xs text-slate-500">Gerado em {new Date(report.createdAt).toLocaleString('pt-BR')}</p>
              {(report.report?.ctrScore != null || report.report?.seoScore != null) && (
                <div className="mt-1.5 flex gap-3 text-[11px]">
                  {report.report?.ctrScore != null && <span className="text-slate-400">CTR <b className="text-cyan-300">{report.report.ctrScore}</b></span>}
                  {report.report?.seoScore != null && <span className="text-slate-400">SEO <b className="text-cyan-300">{report.report.seoScore}</b></span>}
                </div>
              )}
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
              {report.report?.suggestions?.altTitles?.length > 0 && (
                <div className="rounded-lg bg-slate-950 px-3 py-2">
                  <span className="mb-1.5 inline-block rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan-400">TÍTULOS ALTERNATIVOS</span>
                  <ul className="space-y-1">
                    {report.report.suggestions.altTitles.map((tt, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px]">
                        <span className="text-slate-600">›</span>
                        {tt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {report.report?.suggestions?.thumbnail && <Suggestion label="Thumbnail" text={report.report.suggestions.thumbnail} />}
              {report.report?.suggestions?.description && <Suggestion label="Descrição" text={report.report.suggestions.description} />}
              {report.report?.suggestions?.tags?.length > 0 && <ChipSuggestion label="Tags" items={report.report.suggestions.tags} />}
              {report.report?.suggestions?.hashtags?.length > 0 && <ChipSuggestion label="Hashtags" items={report.report.suggestions.hashtags} />}
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

// Sugestão em chips (tags/hashtags) com botão para copiar tudo.
function ChipSuggestion({ label, items }) {
  const [copied, setCopied] = useState(false)
  const joined = items.join(label === 'Hashtags' ? ' ' : ', ')
  function copy() {
    navigator.clipboard?.writeText(joined)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-lg bg-slate-950 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan-400">{label.toUpperCase()}</span>
        <button onClick={copy} className="text-[10px] text-slate-500 hover:text-cyan-300">
          {copied ? '✓ copiado' : 'copiar tudo'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span key={i} className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
            {it}
          </span>
        ))}
      </div>
    </div>
  )
}
