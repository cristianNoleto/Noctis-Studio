import { useEffect, useState } from 'react'
import { Plus, Pencil, FileText, Link2, Trash2, Loader2, Sparkles, Film } from 'lucide-react'
import { useDb } from '../../lib/db'
import { api, apiErrorMessage } from '../../lib/api'
import { Modal, inputCls, btnPrimary, btnGhost, StatusBadge, ScoreRing, ConfirmDialog, EmptyState } from '../../components/ui'
import { Field } from './ChannelsList'
import ScriptDrawer from './ScriptDrawer'

const TABS = [
  ['all', 'Todos'],
  ['planning', 'Planejamento'],
  ['production', 'Produção'],
  ['finished', 'Finalizados'],
  ['scheduled_published', 'Agendados/Publicados'],
]

const STATUS_OPTIONS = [
  ['planning', 'Planejamento'],
  ['production', 'Produção'],
  ['finished', 'Finalizado'],
  ['scheduled', 'Agendado'],
  ['published', 'Publicado'],
]

export default function VideosTable({ channelId }) {
  const db = useDb()
  const [tab, setTab] = useState('all')
  const [editVideo, setEditVideo] = useState(null) // null | 'new' | video
  const [scriptVideo, setScriptVideo] = useState(null)
  const [linkVideo, setLinkVideo] = useState(null)
  const [reportVideo, setReportVideo] = useState(null)
  const [deleteVideo, setDeleteVideo] = useState(null)

  const videos = db.all('videos').filter((v) => v.channelId === channelId)
  const reports = db.all('seoReports')

  const counts = {
    all: videos.length,
    planning: videos.filter((v) => v.status === 'planning').length,
    production: videos.filter((v) => v.status === 'production').length,
    finished: videos.filter((v) => v.status === 'finished').length,
    scheduled_published: videos.filter((v) => ['scheduled', 'published'].includes(v.status)).length,
  }

  const filtered = videos.filter((v) => {
    if (tab === 'all') return true
    if (tab === 'scheduled_published') return ['scheduled', 'published'].includes(v.status)
    return v.status === tab
  })

  function latestReport(videoId) {
    return reports.filter((r) => r.videoId === videoId).sort((a, b) => b.createdAt - a.createdAt)[0] || null
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
        <h2 className="font-semibold text-slate-100">Títulos & Vídeos</h2>
        <button className={`${btnPrimary} flex items-center gap-1.5 !px-3 !py-1.5 text-xs`} onClick={() => setEditVideo('new')}>
          <Plus size={14} />
          Novo Vídeo
        </button>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800 px-5 pt-3">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === key ? 'border-cyan-500 text-cyan-300' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
            <span className="ml-1.5 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{counts[key]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState icon={Film} title="Nenhum vídeo aqui" description="Crie um título para começar o pipeline de produção deste canal." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Vídeo</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Score SEO/CTR</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const report = latestReport(v.id)
                return (
                  <tr key={v.id} className="border-b border-slate-800/50 hover:bg-slate-900/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {v.thumbnailUrl ? (
                          <img
                            src={v.thumbnailUrl}
                            alt=""
                            className="h-10 w-[71px] shrink-0 rounded object-cover transition-transform hover:scale-150"
                          />
                        ) : (
                          <div className="flex h-10 w-[71px] shrink-0 items-center justify-center rounded bg-slate-800 text-slate-600">
                            <Film size={16} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="max-w-md truncate font-medium text-slate-200">{v.title}</p>
                          {v.youtubeUrl && (
                            <a href={v.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-cyan-400 hover:underline">
                              Ver no YouTube
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <ScoreRing score={report?.score ?? null} size={40} />
                        <button onClick={() => setReportVideo(v)} className="text-xs text-cyan-400 hover:text-cyan-300">
                          Relatório
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <RowBtn title="Editar" onClick={() => setEditVideo(v)}>
                          <Pencil size={14} />
                        </RowBtn>
                        <RowBtn title="Roteiro" onClick={() => setScriptVideo(v)}>
                          <FileText size={14} />
                        </RowBtn>
                        <RowBtn title="Vincular URL do YouTube" onClick={() => setLinkVideo(v)}>
                          <Link2 size={14} />
                        </RowBtn>
                        <RowBtn title="Excluir" danger onClick={() => setDeleteVideo(v)}>
                          <Trash2 size={14} />
                        </RowBtn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <VideoFormModal open={editVideo !== null} onClose={() => setEditVideo(null)} channelId={channelId} video={editVideo === 'new' ? null : editVideo} />
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

function RowBtn({ children, title, onClick, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
        danger ? 'text-slate-500 hover:bg-red-500/10 hover:text-red-400' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function VideoFormModal({ open, onClose, channelId, video }) {
  const db = useDb()
  const [form, setForm] = useState({})

  useEffect(() => {
    if (open) {
      setForm({
        title: video?.title || '',
        description: video?.description || '',
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
      description: form.description,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      thumbnailUrl: form.thumbnailUrl || null,
      status: form.status,
    }
    if (video) db.update('videos', video.id, payload)
    else db.insert('videos', { channelId, ...payload })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={video ? 'Editar Vídeo' : 'Novo Vídeo'} wide>
      <form onSubmit={save} className="space-y-4">
        <Field label="TÍTULO">
          <input className={inputCls} required value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="DESCRIÇÃO">
          <textarea className={`${inputCls} min-h-20 resize-y`} value={form.description || ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
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
            {video ? 'Salvar' : 'Criar Vídeo'}
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
    db.update('videos', video.id, { youtubeUrl: url.trim(), status: 'published' })
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

// ---------------------------------------------------------------------------
// Relatório de SEO/CTR por IA (Gemini) — assíncrono na UX, resultado cacheado
// ---------------------------------------------------------------------------
function SeoReportModal({ open, onClose, video }) {
  const db = useDb()
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
      })
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
          <p className="text-sm text-slate-500">
            A IA analisa título, descrição e tags e devolve uma nota 0–100 com pontos fortes, fracos e sugestões.
          </p>
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
          <ReportSection title="✅ Pontos fortes" items={report.report?.strengths} />
          <ReportSection title="⚠️ Pontos fracos" items={report.report?.weaknesses} />
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
      <p className="mb-2 text-xs font-semibold tracking-wide text-slate-400">{title.toUpperCase()}</p>
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
