import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Eye,
  PenTool,
} from 'lucide-react'
import { useDb } from '../../lib/db'
import { useI18n } from '../../i18n'
import { api, apiErrorMessage } from '../../lib/api'
import { createDrawing } from '../../lib/drawings'
import { importChannelVideos } from '../../lib/importVideos'
import { deriveStatus, isPosted, REQUIRED_STEPS } from '../../lib/videoStatus'
import { Modal, inputCls, btnPrimary, btnGhost, ScoreRing, ConfirmDialog, EmptyState } from '../../components/ui'
import { Masked, RestrictedThumb } from '../../components/privacy'
import { Field } from './ChannelsList'
import ScriptDrawer from './ScriptDrawer'
import { persistMedia } from '../../lib/storage'

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
  ['storyboard', 'Storyboard'],
  ['renderizado', 'Renderizado'],
  ['publicado', 'Publicado'],
]

function matchesTab(video, tab) {
  if (tab === 'all') return true
  return deriveStatus(video) === tab
}

export default function VideosTable({ channelId, channel }) {
  const db = useDb()
  const { t } = useI18n()
  const navigate = useNavigate()
  // Colaborador com acesso só "Ver" → tudo em modo leitura (sem editar/salvar).
  const readOnly = !db.canEdit('videos')

  // Storyboards (cenas do Excalidraw) vinculados aos vídeos: mapa videoId → cena.
  // Carregado uma vez; usado para mostrar/abrir o storyboard de cada vídeo.
  const [storyboards, setStoryboards] = useState({})
  const [creatingSb, setCreatingSb] = useState(null) // id do vídeo em criação
  const [sbConfirm, setSbConfirm] = useState(null) // vídeo aguardando confirmação (evita clique acidental)
  async function loadStoryboards() {
    try {
      const { scenes } = await api.excalidraw.list()
      const map = {}
      for (const sc of scenes || []) if (sc.videoId) map[sc.videoId] = sc
      setStoryboards(map)
    } catch {
      /* sem Supabase (dev) ou sem login → sem storyboards */
    }
  }
  useEffect(() => {
    loadStoryboards()
  }, [])

  // Abre o storyboard do vídeo; se não existir, cria um novo com o título do
  // vídeo já vinculado e redireciona pro editor.
  async function openOrCreateStoryboard(video) {
    const existing = storyboards[video.id]
    if (existing) {
      navigate(`/desenhos/${existing.id}`)
      return
    }
    if (creatingSb) return
    setCreatingSb(video.id)
    try {
      const scene = await createDrawing(video.title || t('videos.storyboard'), { videoId: video.id })
      navigate(`/desenhos/${scene.id}`)
    } catch {
      setCreatingSb(null)
    }
  }
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
      setImportMsg(inserted > 0 ? t('videos.importedOk', { n: inserted }) : t('videos.importedNone'))
      setTimeout(() => setImportMsg(''), 4000)
    } catch (err) {
      setImportError(apiErrorMessage(err))
    } finally {
      setImporting(false)
    }
  }

  function toggleStep(video, key) {
    if (readOnly) return
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
    // Preserva o storyboard (etapa opcional) ao completar as etapas obrigatórias.
    const steps = { ...(v.steps || {}), titulo: true, roteiro: true, audio: true, thumbnail: true, renderizado: true, publicado: true }
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
        const data = await api.ai.seoReport({
          title: v.title,
          description: v.description || '',
          tags: v.tags || [],
          language: channel?.language || 'pt',
          channelName: channel?.name || '',
          channelNotes: channel?.notes || channel?.description || '',
        })
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
          <h2 className="text-lg font-bold text-slate-100">{t('videos.section')}</h2>
          <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            <ViewBtn active={view === 'list'} onClick={() => setView('list')} icon={<List size={12} />} label={t('videos.viewList')} />
            <ViewBtn active={view === 'kanban'} onClick={() => setView('kanban')} icon={<LayoutGrid size={12} />} label={t('videos.viewKanban')} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map(([key]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                tab === key ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-500 hover:border-slate-700'
              }`}
            >
              {t(`videos.tabs.${key}`)} ({counts[key]})
            </button>
          ))}
        </div>
      </div>

      {/* Busca + ações */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={`${inputCls} !pl-9`} placeholder={t('videos.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button
          onClick={() => setSortDesc((v) => !v)}
          title={sortDesc ? t('videos.sortNewest') : t('videos.sortOldest')}
          className="flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-3 text-slate-400 hover:border-slate-700"
        >
          <ArrowUpDown size={14} />
        </button>
        {!readOnly && channel?.youtubeChannelId && (
          <button onClick={importFromYoutube} disabled={importing} className={`${btnGhost} flex items-center gap-2 text-xs`}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
            {importing ? importMsg || t('videos.importing') : t('videos.importYoutube')}
          </button>
        )}
        {!readOnly && videos.length > 0 && (
          <button
            onClick={analyzeAll}
            disabled={!batch?.running && pendingReports === 0}
            title={pendingReports === 0 && !batch?.running ? t('videos.analyzeAllDone') : t('videos.analyzeAllHint')}
            className={`${btnGhost} flex items-center gap-2 text-xs disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {batch?.running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {batch?.running ? t('videos.stopAnalysis') : t('videos.analyzeAll', { n: pendingReports })}
          </button>
        )}
        {readOnly ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-400">
            <Eye size={14} />
            {t('videos.readOnly')}
          </span>
        ) : (
          <button className={`${btnPrimary} flex items-center gap-1.5`} onClick={() => setEditVideo('new')}>
            <Plus size={15} />
            {t('videos.newTitle')}
          </button>
        )}
      </div>

      {/* Progresso da análise em lote */}
      {batch && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="min-w-0 truncate text-slate-300">
              {batch.running ? (
                <>
                  {t('videos.analyzing')} <b className="text-cyan-300">{batch.current}</b>...
                </>
              ) : (
                <>
                  {t('videos.batchDone', { n: batch.done - batch.errors })}
                  {batch.errors > 0 && <span className="text-amber-400"> · {t('videos.batchErrors', { n: batch.errors })}</span>}
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
          title={t('videos.emptyTitle')}
          description={channel?.youtubeChannelId ? t('videos.emptyDescYoutube') : t('videos.emptyDesc')}
        />
      ) : view === 'list' ? (
        <div className="space-y-2.5">
          {filtered.map((v) => (
            <VideoRow
              key={v.id}
              video={v}
              readOnly={readOnly}
              storyboard={storyboards[v.id]}
              creatingStoryboard={creatingSb === v.id}
              onStoryboard={() => setSbConfirm(v)}
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
        <VideosKanban videos={filtered} readOnly={readOnly} onOpenScript={setScriptVideo} />
      )}

      {/* Modais */}
      <VideoFormModal open={editVideo !== null} onClose={() => setEditVideo(null)} channelId={channelId} video={editVideo === 'new' ? null : editVideo} nextNumber={Math.max(0, ...videos.map((v) => v.videoNumber || 0)) + 1} readOnly={readOnly} />
      <LinkYoutubeModal open={linkVideo !== null} onClose={() => setLinkVideo(null)} video={linkVideo} />
      <SeoReportModal open={reportVideo !== null} onClose={() => setReportVideo(null)} video={reportVideo} channel={channel} readOnly={readOnly} />
      {scriptVideo && <ScriptDrawer video={scriptVideo} onClose={() => setScriptVideo(null)} />}
      <ConfirmDialog
        open={deleteVideo !== null}
        onClose={() => setDeleteVideo(null)}
        onConfirm={() => {
          db.removeWhere('scripts', (s) => s.videoId === deleteVideo.id)
          db.remove('videos', deleteVideo.id)
        }}
        title={t('videos.deleteTitle')}
        message={t('videos.deleteMsg', { title: deleteVideo?.title })}
      />
      <PublishConfirmModal data={publishConfirm} onClose={() => setPublishConfirm(null)} onConfirm={confirmPublishAll} />
      <ConfirmDialog
        open={sbConfirm !== null}
        onClose={() => setSbConfirm(null)}
        onConfirm={() => {
          const v = sbConfirm
          setSbConfirm(null)
          openOrCreateStoryboard(v)
        }}
        title={sbConfirm && storyboards[sbConfirm.id] ? t('videos.storyboardOpenTitle') : t('videos.storyboardCreateTitle')}
        message={sbConfirm && storyboards[sbConfirm.id] ? t('videos.storyboardOpenMsg') : t('videos.storyboardCreateMsg', { title: sbConfirm?.title })}
        confirmLabel={sbConfirm && storyboards[sbConfirm.id] ? t('videos.storyboardOpen') : t('videos.storyboard')}
        danger={false}
      />
    </div>
  )
}

// Modal ao marcar "Publicado" com etapas faltando (layout do print).
function PublishConfirmModal({ data, onClose, onConfirm }) {
  const { t } = useI18n()
  if (!data) return null
  const missingLabels = data.missing.map(([key]) => t(`videos.steps.${key}`)).join(', ')
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-[420px] rounded-2xl border border-slate-800 bg-slate-900 p-7" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/12 text-sky-400">
          <SquareCheckBig size={22} />
        </div>
        <h3 className="mb-2 text-base font-semibold text-slate-100">{t('videos.publishTitle')}</h3>
        <p className="mb-6 text-sm leading-relaxed text-slate-400">
          {t('videos.publishBody', { list: missingLabels })}
          <br />
          <br />
          {t('videos.publishAsk')}
        </p>
        <div className="flex justify-end gap-2.5">
          <button onClick={onClose} className="rounded-xl border border-slate-800 px-5 py-2 text-[13px] font-medium text-slate-400 transition-colors hover:bg-slate-800/50">
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-gradient-to-br from-sky-500 to-blue-500 px-5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            {t('videos.publishConfirm')}
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
  const { t } = useI18n()
  const cls = {
    planning: 'bg-slate-700/40 text-slate-300',
    production: 'bg-amber-500/15 text-amber-400',
    finished: 'bg-cyan-500/15 text-cyan-300',
    scheduled_published: 'bg-green-500/15 text-green-300',
  }
  const status = deriveStatus(video)
  return <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${cls[status] || cls.planning}`}>{t(`videos.tabs.${status}`)}</span>
}

function VideoRow({ video: v, readOnly, storyboard, creatingStoryboard, onStoryboard, onToggleStep, onEdit, onScript, onReport, onLink, onDelete }) {
  const db = useDb()
  const { t } = useI18n()
  const report = db.all('seoReports').filter((r) => r.videoId === v.id).sort((a, b) => b.createdAt - a.createdAt)[0]
  const fileRef = useRef(null)
  const [zoom, setZoom] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyTitle() {
    if (!v.title) return
    try {
      await navigator.clipboard.writeText(v.title)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard indisponível */
    }
  }

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressThumb(file)
      const url = await persistMedia(dataUrl, { folder: 'thumb', ext: 'jpg' })
      db.update('videos', v.id, { thumbnailUrl: url })
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
              <ThumbBtn title={t('videos.thumbView')} onClick={() => setZoom(true)}>
                <ZoomIn size={12} />
              </ThumbBtn>
              <ThumbBtn title={t('videos.thumbDownload')} onClick={downloadThumb}>
                <Download size={12} />
              </ThumbBtn>
              {!readOnly && (
                <>
                  <ThumbBtn title={t('videos.thumbReplace')} onClick={() => fileRef.current?.click()}>
                    <Upload size={12} />
                  </ThumbBtn>
                  <ThumbBtn title={t('videos.thumbRemove')} danger onClick={() => db.update('videos', v.id, { thumbnailUrl: null })}>
                    <Trash2 size={12} />
                  </ThumbBtn>
                </>
              )}
            </>
          ) : (
            !readOnly && (
              <ThumbBtn title={t('videos.thumbUpload')} onClick={() => fileRef.current?.click()}>
                <Upload size={12} />
              </ThumbBtn>
            )
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
          {v.videoNumber != null && <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">{t('videos.videoNum', { n: v.videoNumber })}</span>}
          <StatusTag video={v} />
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          {v.publishedAt && (
            <span className="flex items-center gap-1">
              <Calendar size={9} />
              {new Date(v.publishedAt).toLocaleDateString('pt-BR')}
            </span>
          )}
          {v.imported && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-500">{t('videos.importedTag')}</span>}
        </div>
      </div>

      {/* Título + etapas */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            onClick={copyTitle}
            title={t('videos.copyHint')}
            className="min-w-0 truncate font-semibold text-slate-100 transition-colors hover:text-cyan-300 cursor-pointer"
          >
            <Masked mask="•••••••••••">{v.title}</Masked>
          </p>
          {(() => {
            const len = (v.title || '').length
            const tone = len > 100 ? 'text-red-400' : len >= 90 ? 'text-amber-400' : 'text-slate-600'
            return (
              <span className={`shrink-0 font-mono text-[10px] tabular-nums ${tone}`} title={t('videos.form.title')}>
                {len}/100
              </span>
            )
          })()}
        </div>
        {copied && (
          <div className="fixed bottom-6 right-6 z-[120] rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 shadow-lg">
            {t('videos.titleCopied')}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {STEPS.map(([key]) => {
            const done = !!v.steps?.[key]
            const label = t(`videos.steps.${key}`)
            return (
              <button
                key={key}
                onClick={() => onToggleStep(key)}
                disabled={readOnly}
                title={done ? t('videos.stepDone', { label }) : t('videos.stepPending', { label })}
                className={`flex items-center gap-1 text-[10px] transition-colors ${readOnly ? 'cursor-default' : ''} ${done ? 'text-green-400' : `text-slate-600 ${readOnly ? '' : 'hover:text-slate-400'}`}`}
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
        <button
          onClick={onReport}
          title={t('videos.reportTitle')}
          className="mr-0.5 flex h-8 items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-2 text-xs font-bold text-cyan-400 transition-colors hover:border-cyan-500/40 hover:text-cyan-300"
        >
          <span className="text-[9px] font-semibold text-slate-500">SEO</span>
          {report?.score != null ? `${report.score}/100` : '—/100'}
        </button>
        <StoryboardChip storyboard={storyboard} creating={creatingStoryboard} onClick={onStoryboard} />
        <RowBtn title={readOnly ? t('videos.view') : t('videos.edit')} onClick={onEdit}>
          {readOnly ? <Eye size={14} /> : <Pencil size={14} />}
        </RowBtn>
        {v.youtubeUrl ? (
          <a
            href={v.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={t('videos.openYoutube')}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-500 transition-colors hover:border-red-500/40 hover:bg-slate-800 hover:text-red-400"
          >
            <PlaySquare size={15} />
          </a>
        ) : (
          !readOnly && (
            <RowBtn title={t('videos.linkYoutube')} onClick={onLink}>
              <Link2 size={14} />
            </RowBtn>
          )
        )}
        {!readOnly && (
          <RowBtn title={t('videos.delete')} danger onClick={onDelete}>
            <Trash2 size={14} />
          </RowBtn>
        )}
        <button
          onClick={onScript}
          title={t('videos.roteiro')}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <FileText size={13} />
          {t('videos.roteiro')}
        </button>
      </div>
    </div>
  )
}

// Botão do storyboard na direita da linha (depois do SEO):
// - sem storyboard: CRIA um novo board com o título do vídeo (já vinculado)
// - com storyboard: fica ciano e ABRE o board direto ao clicar
function StoryboardChip({ storyboard, creating, onClick }) {
  const { t } = useI18n()
  const linked = !!storyboard
  return (
    <button
      onClick={onClick}
      disabled={creating}
      title={linked ? t('videos.storyboardOpen') : t('videos.storyboardCreate')}
      className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors ${
        linked
          ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
          : 'border-slate-700 text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300'
      }`}
    >
      {creating ? <Loader2 size={13} className="animate-spin" /> : <PenTool size={13} />}
      {t('videos.storyboard')}
    </button>
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
      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
        danger
          ? 'border-slate-800 bg-slate-900/60 text-slate-500 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400'
          : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:border-cyan-500/40 hover:bg-slate-800 hover:text-cyan-300'
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

function VideosKanban({ videos, readOnly, onOpenScript }) {
  const db = useDb()
  const { t } = useI18n()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function onDragEnd({ active, over }) {
    if (readOnly || !over) return
    const v = db.get('videos', active.id)
    if (!v) return
    // Arrastar para uma coluna ajusta as etapas para bater com aquele estágio.
    const base = { titulo: true, roteiro: false, audio: false, thumbnail: false, storyboard: false, renderizado: false, publicado: false }
    const steps = { ...base, ...(v.steps || {}), titulo: true }
    if (over.id === 'planning') Object.assign(steps, { roteiro: false, audio: false, thumbnail: false, storyboard: false, renderizado: false, publicado: false })
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
        {KANBAN_COLUMNS.map(([key, , color]) => (
          <KanbanColumn key={key} id={key} label={t(`videos.tabs.${key}`)} color={color} videos={videos.filter((v) => matchesTab(v, key))} readOnly={readOnly} onOpenScript={onOpenScript} />
        ))}
      </div>
    </DndContext>
  )
}

function KanbanColumn({ id, label, color, videos, readOnly, onOpenScript }) {
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
          <KanbanCard key={v.id} video={v} readOnly={readOnly} onOpenScript={onOpenScript} />
        ))}
      </div>
    </div>
  )
}

function KanbanCard({ video: v, readOnly, onOpenScript }) {
  const { t } = useI18n()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: v.id, disabled: readOnly })
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined
  const dnd = readOnly ? {} : { ...listeners, ...attributes }
  return (
    <div ref={setNodeRef} style={style} {...dnd} className={`rounded-lg border border-slate-800 bg-slate-950 p-2.5 ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'} ${isDragging ? 'opacity-80 shadow-2xl' : ''}`}>
      {v.thumbnailUrl && <RestrictedThumb src={v.thumbnailUrl} className="mb-2 aspect-video w-full rounded object-cover" loading="lazy" />}
      <p className="line-clamp-2 text-xs font-medium leading-snug text-slate-200"><Masked mask="•••••••••••">{v.title}</Masked></p>
      <div className="mt-1.5 flex items-center justify-between">
        {v.videoNumber != null && <span className="text-[9px] text-slate-600">{t('videos.videoNum', { n: v.videoNumber })}</span>}
        <div className="flex items-center gap-2">
          {v.youtubeUrl && (
            <a
              href={v.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              title={t('videos.openYoutube')}
              className="flex items-center gap-1 text-[10px] text-red-400 hover:underline"
            >
              <PlaySquare size={12} />
              YouTube
            </a>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenScript(v)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-[10px] text-cyan-400 hover:underline"
          >
            {t('videos.roteiro')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modais
// ---------------------------------------------------------------------------
function VideoFormModal({ open, onClose, channelId, video, nextNumber, readOnly }) {
  const db = useDb()
  const { t } = useI18n()
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
    if (readOnly) return onClose()
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
    <Modal open={open} onClose={onClose} title={readOnly ? t('videos.form.viewTitle') : video ? t('videos.form.editTitle') : t('videos.form.createTitle')} wide>
      <p className="-mt-3 mb-5 text-xs text-slate-500">{readOnly ? t('videos.form.viewSub') : video ? t('videos.form.editSub') : t('videos.form.createSub')}</p>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={readOnly} className="space-y-4 border-0 p-0">
        <div>
          <div className="mb-1.5 flex items-end justify-between">
            <label className="block text-xs font-semibold tracking-wide text-slate-400">{t('videos.form.title')}</label>
            <span className="text-[10px] text-slate-600">{(form.title || '').length}/100</span>
          </div>
          <input className={inputCls} required maxLength={100} placeholder={t('videos.form.titlePlaceholder')} value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
        </div>

        <div>
          <div className="mb-1.5 flex items-end justify-between">
            <label className="block text-xs font-semibold tracking-wide text-slate-400">{t('videos.form.thumbConcept')}</label>
            <span className="text-[10px] text-slate-600">{(form.thumbnailConcept || '').length}</span>
          </div>
          <input className={inputCls} placeholder={t('videos.form.thumbConceptPlaceholder')} value={form.thumbnailConcept || ''} onChange={(e) => set('thumbnailConcept', e.target.value)} />
          <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{t('videos.form.thumbConceptHint')}</p>
        </div>

        <div>
          <div className="mb-1.5 flex items-end justify-between">
            <label className="block text-xs font-semibold tracking-wide text-slate-400">{t('videos.form.description')}</label>
            <span className="text-[10px] text-slate-600">{(form.description || '').length}/5000</span>
          </div>
          <textarea className={`${inputCls} min-h-24 resize-y`} maxLength={5000} placeholder={t('videos.form.descriptionPlaceholder')} value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div>
          <Field label={t('videos.form.postDate')}>
            <input className={inputCls} type="date" value={form.postDate || ''} onChange={(e) => set('postDate', e.target.value)} />
          </Field>
          <p className="mt-1 text-[10px] text-slate-600">{t('videos.form.postDateHint')}</p>
        </div>

        <Field label={t('videos.form.tags')}>
          <input className={inputCls} value={form.tags || ''} onChange={(e) => set('tags', e.target.value)} />
        </Field>
        <Field label={t('videos.form.thumbUrl')}>
          <input className={inputCls} value={form.thumbnailUrl || ''} onChange={(e) => set('thumbnailUrl', e.target.value)} placeholder={t('videos.form.thumbUrlPlaceholder')} />
        </Field>
        <p className="-mt-2 text-[10px] text-slate-600">{t('videos.form.statusAuto')}</p>
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {readOnly ? t('common.close') : t('common.cancel')}
          </button>
          {!readOnly && (
            <button type="submit" className={btnPrimary}>
              {video ? t('videos.form.save') : t('videos.form.create')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}

function LinkYoutubeModal({ open, onClose, video }) {
  const db = useDb()
  const { t } = useI18n()
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
    <Modal open={open} onClose={onClose} title={t('videos.link.title')}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-500">{t('videos.link.desc')}</p>
        <input className={inputCls} required type="url" placeholder="https://youtube.com/watch?v=..." value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={btnPrimary}>
            {t('videos.link.submit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Relatório de SEO/CTR por IA — resultado cacheado localmente
function SeoReportModal({ open, onClose, video, channel, readOnly }) {
  const db = useDb()
  const { t } = useI18n()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const report = video ? db.all('seoReports').filter((r) => r.videoId === video.id).sort((a, b) => b.createdAt - a.createdAt)[0] : null

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const data = await api.ai.seoReport({
        title: video.title,
        description: video.description || '',
        tags: video.tags || [],
        language: channel?.language || 'pt',
        channelName: channel?.name || '',
        channelNotes: channel?.notes || channel?.description || '',
      })
      db.insert('seoReports', { videoId: video.id, score: data.score, report: data })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('videos.seo.title')} wide>
      {!report && !generating && (
        <div className="py-6 text-center">
          <p className="text-sm text-slate-500">{readOnly ? t('videos.seo.none') : t('videos.seo.intro')}</p>
          {!readOnly && (
            <button className={`${btnPrimary} mt-4 inline-flex items-center gap-2`} onClick={generate}>
              <Sparkles size={15} />
              {t('videos.seo.generate')}
            </button>
          )}
          {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>
      )}
      {generating && (
        <div className="flex flex-col items-center py-10">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
          <p className="mt-3 text-sm text-slate-500">{t('videos.seo.analyzing')}</p>
        </div>
      )}
      {report && !generating && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <ScoreRing score={report.score} size={64} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-100">{video?.title}</p>
              <p className="text-xs text-slate-500">{t('videos.seo.generatedAt', { date: new Date(report.createdAt).toLocaleString('pt-BR') })}</p>
              {(report.report?.ctrScore != null || report.report?.seoScore != null) && (
                <div className="mt-1.5 flex gap-3 text-[11px]">
                  {report.report?.ctrScore != null && <span className="text-slate-400">CTR <b className="text-cyan-300">{report.report.ctrScore}</b></span>}
                  {report.report?.seoScore != null && <span className="text-slate-400">SEO <b className="text-cyan-300">{report.report.seoScore}</b></span>}
                </div>
              )}
            </div>
            {!readOnly && (
              <button className={`${btnGhost} ml-auto !px-3 !py-1.5 text-xs`} onClick={generate}>
                {t('videos.seo.regenerate')}
              </button>
            )}
          </div>
          <ReportSection title={t('videos.seo.strengths')} items={report.report?.strengths} />
          <ReportSection title={t('videos.seo.weaknesses')} items={report.report?.weaknesses} />
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{t('videos.seo.suggestions')}</p>
            <div className="space-y-2 text-sm text-slate-300">
              {report.report?.suggestions?.title && <Suggestion label={t('videos.seo.labelTitle')} text={report.report.suggestions.title} />}
              {report.report?.suggestions?.altTitles?.length > 0 && (
                <div className="rounded-lg bg-slate-950 px-3 py-2">
                  <span className="mb-1.5 inline-block rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-bold text-cyan-400">{t('videos.seo.altTitles')}</span>
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
              {report.report?.suggestions?.thumbnail && <Suggestion label={t('videos.seo.labelThumbnail')} text={report.report.suggestions.thumbnail} />}
              {report.report?.suggestions?.description && <Suggestion label={t('videos.seo.labelDescription')} text={report.report.suggestions.description} />}
              {report.report?.suggestions?.tags?.length > 0 && <ChipSuggestion label={t('videos.seo.labelTags')} items={report.report.suggestions.tags} />}
              {report.report?.suggestions?.hashtags?.length > 0 && <ChipSuggestion label={t('videos.seo.labelHashtags')} items={report.report.suggestions.hashtags} sep=" " />}
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
function ChipSuggestion({ label, items, sep = ', ' }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const joined = items.join(sep)
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
          {copied ? t('videos.seo.copied') : t('videos.seo.copyAll')}
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
