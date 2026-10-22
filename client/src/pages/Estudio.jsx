import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clapperboard, Image as ImageIcon, Video, Loader2, Play, Download, Lock, Sparkles, Info, RefreshCw } from 'lucide-react'
import { useI18n } from '../i18n'
import { api, apiErrorMessage } from '../lib/api'
import { isLocalMode } from '../lib/supabase'
import { inputCls, btnPrimary } from '../components/ui'

// Estúdio de geração: imagem (síncrona) e vídeo (Veo, assíncrono) pela API oficial
// do Google. Chave do dono (central, no servidor), cota diária por usuário. Nenhuma
// chave trafega pelo navegador; esta tela só chama /api/media-gen/*.

const MAX_CHARS = 5000
const ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4']

export default function Estudio() {
  const { t } = useI18n()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [statusError, setStatusError] = useState('')
  const [tab, setTab] = useState('image')

  const reloadStatus = () => api.mediaGen.status().then(setStatus).catch((e) => setStatusError(apiErrorMessage(e)))

  useEffect(() => {
    if (isLocalMode) { setLoading(false); return }
    reloadStatus().finally(() => setLoading(false))
  }, [])

  const header = (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/12 text-cyan-400"><Clapperboard size={22} /></div>
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('studio.title')}</h1>
        <p className="text-sm text-slate-500">{t('studio.subtitle')}</p>
      </div>
    </div>
  )

  if (loading) return <Wrap>{header}<div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-cyan-500" /></div></Wrap>
  if (isLocalMode) return <Wrap>{header}<Notice icon={Info} title={t('studio.localTitle')} body={t('studio.localBody')} /></Wrap>
  if (statusError) return <Wrap>{header}<Notice icon={Info} title={t('studio.unavailableTitle')} body={statusError} /></Wrap>

  if (status && !status.available) {
    if (status.reason === 'plan') {
      return (
        <Wrap>{header}
          <div className="mx-auto mt-2 flex max-w-xl flex-col items-center rounded-2xl border border-cyan-500/20 bg-slate-900/40 p-10 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-400"><Lock size={28} /></div>
            <h2 className="text-xl font-bold text-slate-100">{t('studio.title')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{t('studio.planBody', { plan: status.minPlan })}</p>
            <Link to="/meu-plano" className={`${btnPrimary} mt-5`}>{t('studio.planCta')}</Link>
          </div>
        </Wrap>
      )
    }
    return <Wrap>{header}<Notice icon={Sparkles} title={t('studio.soonTitle')} body={t('studio.soonBody')} /></Wrap>
  }

  return (
    <Wrap>
      {header}
      <div className="flex flex-wrap gap-1.5">
        {[['image', ImageIcon], ['video', Video]].map(([key, Icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${tab === key ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'}`}>
            <Icon size={15} /> {t(`studio.tabs.${key}`)}
          </button>
        ))}
      </div>
      {tab === 'image' ? <ImageTab status={status} onUsed={reloadStatus} /> : <VideoTab status={status} onUsed={reloadStatus} />}
    </Wrap>
  )
}

function Wrap({ children }) {
  return <div className="mx-auto max-w-[1100px] space-y-5">{children}</div>
}

function Quota({ remaining, limit, unlimited, label }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      {unlimited ? (
        <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">{t('studio.unlimited')}</span>
      ) : (
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${remaining > 0 ? 'bg-cyan-500/10 text-cyan-300' : 'bg-amber-500/10 text-amber-300'}`}>
          {remaining ?? 0} / {limit}
        </span>
      )}
    </div>
  )
}

function AspectSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} max-w-[140px]`}>
      {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
    </select>
  )
}

// ------------------------------- IMAGEM -------------------------------
function ImageTab({ status, onUsed }) {
  const { t } = useI18n()
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState('16:9')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [img, setImg] = useState(null)
  const lastUrl = useRef(null)
  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current) }, [])

  const remaining = status.unlimited ? null : status.imageRemaining
  const canGen = !busy && prompt.trim() && prompt.length <= MAX_CHARS && (status.unlimited || (remaining ?? 0) > 0)

  async function generate() {
    if (!canGen) return
    setBusy(true); setError('')
    try {
      const { blob } = await api.mediaGen.image({ prompt: prompt.trim(), aspectRatio: aspect })
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
      const url = URL.createObjectURL(blob)
      lastUrl.current = url
      setImg({ url, name: `imagem-${Date.now()}.png` })
      onUsed()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Quota remaining={remaining} limit={status.imageLimit} unlimited={status.unlimited} label={t('studio.quotaImagesLabel')} />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('studio.promptLabel')}</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))} rows={8} placeholder={t('studio.promptPlaceholderImage')} className={`${inputCls} resize-y leading-relaxed`} />
          <div className="flex items-center justify-between text-[11px] text-slate-500"><span>{t('studio.oneImageNote')}</span><span>{prompt.length}/{MAX_CHARS}</span></div>
          <div className="flex flex-wrap items-center gap-3">
            <AspectSelect value={aspect} onChange={setAspect} />
            <button onClick={generate} disabled={!canGen} className={`${btnPrimary} inline-flex items-center gap-2 ${!canGen ? 'cursor-not-allowed opacity-50' : ''}`}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {busy ? t('studio.generating') : t('studio.generateImage')}
            </button>
          </div>
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">{error}</p>}
        </div>
        <div>
          {img ? (
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <img src={img.url} alt="" className="w-full rounded-lg" />
              <a href={img.url} download={img.name} className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:underline"><Download size={15} /> {t('studio.download')}</a>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-800 text-sm text-slate-600">{t('studio.imagePreview')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ------------------------------- VÍDEO -------------------------------
function VideoTab({ status, onUsed }) {
  const { t } = useI18n()
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState('16:9')
  const [negative, setNegative] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [jobs, setJobs] = useState([])
  const [videoUrls, setVideoUrls] = useState({}) // jobId -> objectURL
  const pollRef = useRef(null)

  const loadJobs = () => api.mediaGen.videos().then((r) => setJobs(r.jobs || [])).catch(() => {})
  useEffect(() => { loadJobs() }, [])

  // Poll enquanto houver job em processamento.
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'processing' || j.status === 'pending')
    if (!hasActive) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } return }
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      const active = jobs.filter((j) => j.status === 'processing' || j.status === 'pending')
      for (const j of active) {
        try {
          const s = await api.mediaGen.videoStatus(j.id)
          if (s.status !== j.status) {
            setJobs((prev) => prev.map((x) => (x.id === j.id ? { ...x, status: s.status, error: s.error } : x)))
            if (s.status === 'done') onUsed()
          }
        } catch { /* ignora; tenta no próximo tick */ }
      }
    }, 8000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [jobs])

  useEffect(() => () => { Object.values(videoUrls).forEach((u) => URL.revokeObjectURL(u)) }, [])

  const remaining = status.unlimited ? null : status.videoRemaining
  const canGen = !submitting && prompt.trim() && prompt.length <= MAX_CHARS && (status.unlimited || (remaining ?? 0) > 0)

  async function submit() {
    if (!canGen) return
    setSubmitting(true); setError('')
    try {
      const r = await api.mediaGen.videoStart({ prompt: prompt.trim(), aspectRatio: aspect, negativePrompt: negative.trim() || undefined })
      setJobs((prev) => [{ id: r.jobId, status: r.status || 'processing', prompt: prompt.trim(), created_at: new Date().toISOString() }, ...prev])
      setPrompt('')
      onUsed()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function openVideo(job) {
    if (videoUrls[job.id]) return
    try {
      const blob = await api.mediaGen.videoFile(job.id)
      const url = URL.createObjectURL(blob)
      setVideoUrls((prev) => ({ ...prev, [job.id]: url }))
    } catch (e) {
      setError(apiErrorMessage(e))
    }
  }

  const statusLabel = (s) => ({ pending: t('studio.videoPending'), processing: t('studio.videoProcessing'), done: t('studio.videoDone'), failed: t('studio.videoFailed') }[s] || s)

  return (
    <div className="space-y-4">
      <Quota remaining={remaining} limit={status.videoLimit} unlimited={status.unlimited} label={t('studio.quotaVideosLabel')} />
      <div className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('studio.promptLabel')}</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))} rows={5} placeholder={t('studio.promptPlaceholderVideo')} className={`${inputCls} resize-y leading-relaxed`} />
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={negative} onChange={(e) => setNegative(e.target.value.slice(0, 1000))} placeholder={t('studio.negativePlaceholder')} className={inputCls} />
          <div className="flex items-center gap-3">
            <AspectSelect value={aspect} onChange={setAspect} />
            <button onClick={submit} disabled={!canGen} className={`${btnPrimary} inline-flex items-center gap-2 ${!canGen ? 'cursor-not-allowed opacity-50' : ''}`}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {submitting ? t('studio.generating') : t('studio.generateVideo')}
            </button>
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Info size={12} /> {t('studio.videoWait')}</p>
        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-300">{error}</p>}
      </div>

      {/* Fila de vídeos */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">{t('studio.videoQueue')}</h3>
            <button onClick={loadJobs} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-300"><RefreshCw size={12} /> {t('studio.refresh')}</button>
          </div>
          <div className="space-y-2">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 flex-1 text-sm text-slate-300">{job.prompt}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${job.status === 'done' ? 'bg-emerald-500/10 text-emerald-300' : job.status === 'failed' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>
                    {(job.status === 'processing' || job.status === 'pending') && <Loader2 size={11} className="mr-1 inline animate-spin" />}
                    {statusLabel(job.status)}
                  </span>
                </div>
                {job.status === 'failed' && job.error && <p className="mt-1 text-xs text-red-400/80">{job.error}</p>}
                {job.status === 'done' && (
                  videoUrls[job.id] ? (
                    <div className="mt-2 space-y-2">
                      <video controls src={videoUrls[job.id]} className="w-full rounded-lg" />
                      <a href={videoUrls[job.id]} download={`video-${job.id}.mp4`} className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:underline"><Download size={15} /> {t('studio.downloadVideo')}</a>
                    </div>
                  ) : (
                    <button onClick={() => openVideo(job)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:underline"><Play size={14} /> {t('studio.openVideo')}</button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Notice({ icon: Icon, title, body }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/60 text-slate-400"><Icon size={22} /></div>
      <p className="text-lg font-semibold text-slate-200">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-500">{body}</p>
    </div>
  )
}
