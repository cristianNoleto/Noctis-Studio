import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Image as ImageIcon, Video, Loader2, Play, Download, Sparkles, Lock, Info, RefreshCw } from 'lucide-react'
import { PageHeader, Card, Field, Segmented, inputCls, btnPrimary, Spinner } from '../components/ui'
import { studio } from '../lib/studio'
import { useToast } from '../lib/api'

// Estúdio: imagem (Imagen/Nano Banana) e vídeo (Veo) pela API oficial do Google.
// Chave do dono no servidor; o app chama a API hospedada com a conta Noctis.
// Imagem é síncrona; vídeo é assíncrono (fila: submete → consulta → baixa).

const MAX_CHARS = 5000
const ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4']

export default function Estudio() {
  const toast = useToast()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('image')

  const reload = () => studio.mediaStatus().then(setStatus).catch(() => setStatus({ available: false, reason: 'error' }))
  useEffect(() => { reload().finally(() => setLoading(false)) }, [])

  const header = <PageHeader icon={Clapperboard} kicker="Produção" title="Estúdio" subtitle="Imagens e vídeos com a IA oficial do Google (Imagen + Veo)." />

  if (loading) return <Wrap>{header}<div className="flex h-40 items-center justify-center"><Spinner size={26} /></div></Wrap>
  if (status && !status.available) {
    if (status.reason === 'plan') return <Wrap>{header}<Card className="p-8 text-center"><Lock size={26} className="mx-auto mb-3 text-cyan-400" /><p className="text-lg font-semibold text-slate-200">Estúdio no plano {status.minPlan}+</p><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Faça upgrade para gerar imagens e vídeos com IA.</p></Card></Wrap>
    return <Wrap>{header}<Card className="p-8 text-center"><Sparkles size={26} className="mx-auto mb-3 text-slate-400" /><p className="text-lg font-semibold text-slate-200">Em breve</p><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">A geração ainda não foi ativada. O dono precisa configurar a chave do Google em Perfil → APIs no site.</p></Card></Wrap>
  }

  return (
    <Wrap>
      {header}
      <div className="mb-4">
        <Segmented options={[{ value: 'image', label: 'Imagem' }, { value: 'video', label: 'Vídeo' }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'image' ? <ImageTab status={status} onUsed={reload} toast={toast} /> : <VideoTab status={status} onUsed={reload} toast={toast} />}
    </Wrap>
  )
}

function Wrap({ children }) {
  return <div className="mx-auto max-w-[1100px] px-8 py-7">{children}</div>
}

function Quota({ remaining, limit, unlimited, label }) {
  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
      <span className="text-sm text-slate-400">{label}</span>
      {unlimited
        ? <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">Ilimitado</span>
        : <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${remaining > 0 ? 'bg-cyan-500/10 text-cyan-300' : 'bg-amber-500/10 text-amber-300'}`}>{remaining ?? 0} / {limit}</span>}
    </div>
  )
}

function AspectSelect({ value, onChange }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} max-w-[130px]`}>{ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
}

function ImageTab({ status, onUsed, toast }) {
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState('16:9')
  const [busy, setBusy] = useState(false)
  const [img, setImg] = useState(null)
  const lastUrl = useRef(null)
  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current) }, [])

  const remaining = status.unlimited ? null : status.imageRemaining
  const canGen = !busy && prompt.trim() && prompt.length <= MAX_CHARS && (status.unlimited || (remaining ?? 0) > 0)

  async function generate() {
    if (!canGen) return
    setBusy(true)
    try {
      const { blob } = await studio.image({ prompt: prompt.trim(), aspectRatio: aspect })
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
      const url = URL.createObjectURL(blob)
      lastUrl.current = url
      setImg({ url, name: `imagem-${Date.now()}.png` })
      onUsed()
    } catch (e) { toast(e.message || 'Falha ao gerar a imagem.', 'error') } finally { setBusy(false) }
  }

  return (
    <div>
      <Quota remaining={remaining} limit={status.imageLimit} unlimited={status.unlimited} label="Imagens de hoje" />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Field label="Prompt"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))} rows={8} placeholder="Descreva a imagem..." className={`${inputCls} resize-y leading-relaxed`} /></Field>
          <div className="flex items-center gap-3">
            <AspectSelect value={aspect} onChange={setAspect} />
            <button onClick={generate} disabled={!canGen} className={`${btnPrimary} inline-flex items-center gap-2 ${!canGen ? 'cursor-not-allowed opacity-50' : ''}`}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {busy ? 'Gerando...' : 'Gerar imagem'}
            </button>
          </div>
        </div>
        <div>
          {img
            ? <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3"><img src={img.url} alt="" className="w-full rounded-lg" /><a href={img.url} download={img.name} className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:underline"><Download size={15} /> Baixar imagem</a></div>
            : <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-800 text-sm text-slate-600">A imagem gerada aparece aqui</div>}
        </div>
      </div>
    </div>
  )
}

function VideoTab({ status, onUsed, toast }) {
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState('16:9')
  const [negative, setNegative] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [jobs, setJobs] = useState([])
  const [videoUrls, setVideoUrls] = useState({})
  const pollRef = useRef(null)

  const loadJobs = () => studio.videos().then((r) => setJobs(r.jobs || [])).catch(() => {})
  useEffect(() => { loadJobs() }, [])
  useEffect(() => {
    const active = jobs.some((j) => j.status === 'processing' || j.status === 'pending')
    if (!active) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } return }
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      for (const j of jobs.filter((x) => x.status === 'processing' || x.status === 'pending')) {
        try {
          const s = await studio.videoStatus(j.id)
          if (s.status !== j.status) {
            setJobs((prev) => prev.map((x) => (x.id === j.id ? { ...x, status: s.status, error: s.error } : x)))
            if (s.status === 'done') onUsed()
          }
        } catch { /* tenta no próximo tick */ }
      }
    }, 8000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [jobs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { Object.values(videoUrls).forEach((u) => URL.revokeObjectURL(u)) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = status.unlimited ? null : status.videoRemaining
  const canGen = !submitting && prompt.trim() && prompt.length <= MAX_CHARS && (status.unlimited || (remaining ?? 0) > 0)

  async function submit() {
    if (!canGen) return
    setSubmitting(true)
    try {
      const r = await studio.videoStart({ prompt: prompt.trim(), aspectRatio: aspect, negativePrompt: negative.trim() || undefined })
      setJobs((prev) => [{ id: r.jobId, status: r.status || 'processing', prompt: prompt.trim(), created_at: new Date().toISOString() }, ...prev])
      setPrompt('')
      onUsed()
    } catch (e) { toast(e.message || 'Falha ao iniciar o vídeo.', 'error') } finally { setSubmitting(false) }
  }
  async function openVideo(job) {
    if (videoUrls[job.id]) return
    try { const blob = await studio.videoFile(job.id); setVideoUrls((p) => ({ ...p, [job.id]: URL.createObjectURL(blob) })) }
    catch (e) { toast(e.message || 'Falha ao baixar o vídeo.', 'error') }
  }
  const label = (s) => ({ pending: 'Na fila', processing: 'Gerando', done: 'Pronto', failed: 'Falhou' }[s] || s)

  return (
    <div>
      <Quota remaining={remaining} limit={status.videoLimit} unlimited={status.unlimited} label="Vídeos de hoje" />
      <div className="space-y-3">
        <Field label="Prompt"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))} rows={5} placeholder="Descreva a cena do vídeo..." className={`${inputCls} resize-y leading-relaxed`} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={negative} onChange={(e) => setNegative(e.target.value.slice(0, 1000))} placeholder="Prompt negativo (opcional)" className={inputCls} />
          <div className="flex items-center gap-3">
            <AspectSelect value={aspect} onChange={setAspect} />
            <button onClick={submit} disabled={!canGen} className={`${btnPrimary} inline-flex items-center gap-2 ${!canGen ? 'cursor-not-allowed opacity-50' : ''}`}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {submitting ? 'Gerando...' : 'Gerar vídeo'}
            </button>
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Info size={12} /> Vídeos levam alguns minutos. Pode trocar de tela — continuam na fila abaixo.</p>
      </div>

      {jobs.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">Seus vídeos</h3>
            <button onClick={loadJobs} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-300"><RefreshCw size={12} /> Atualizar</button>
          </div>
          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 flex-1 text-sm text-slate-300">{job.prompt}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${job.status === 'done' ? 'bg-emerald-500/10 text-emerald-300' : job.status === 'failed' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>
                  {(job.status === 'processing' || job.status === 'pending') && <Loader2 size={11} className="mr-1 inline animate-spin" />}{label(job.status)}
                </span>
              </div>
              {job.status === 'failed' && job.error && <p className="mt-1 text-xs text-red-400/80">{job.error}</p>}
              {job.status === 'done' && (videoUrls[job.id]
                ? <div className="mt-2 space-y-2"><video controls src={videoUrls[job.id]} className="w-full rounded-lg" /><a href={videoUrls[job.id]} download={`video-${job.id}.mp4`} className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:underline"><Download size={15} /> Baixar .mp4</a></div>
                : <button onClick={() => openVideo(job)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 hover:underline"><Play size={14} /> Abrir vídeo</button>)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
