import { useEffect, useRef, useState } from 'react'
import { UploadCloud, Loader2, Mic, Copy, FileDown, Captions, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { btnGhost, EmptyState } from '../components/ui'
import { downloadFile, generateSrt } from '../lib/text'

const STATUS_LABEL = {
  preparing: 'Preparando áudio',
  transcribing: 'Transcrevendo',
  done: 'Pronto',
  error: 'Erro',
}

export default function Transcription() {
  const db = useDb()
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  const jobs = [...db.all('transcriptions')].sort((a, b) => b.createdAt - a.createdAt)

  // Polling dos jobs em andamento (a fila real roda na AssemblyAI)
  useEffect(() => {
    const pending = jobs.filter((j) => ['preparing', 'transcribing'].includes(j.status))
    if (!pending.length) return
    pollRef.current = setInterval(async () => {
      for (const job of pending) {
        try {
          const data = await api.transcription.status(job.remoteId)
          if (data.status !== job.status || data.status === 'done') {
            db.update('transcriptions', job.id, {
              status: data.status,
              text: data.text || null,
              blocks: data.blocks || null,
              errorMessage: data.message || null,
            })
          }
        } catch {
          // servidor offline no momento — tenta de novo no próximo tick
        }
      }
    }, 4000)
    return () => clearInterval(pollRef.current)
  }, [jobs.map((j) => `${j.id}:${j.status}`).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleFile(file) {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { id } = await api.transcription.create(form)
      db.insert('transcriptions', { fileName: file.name, remoteId: id, status: 'preparing', sourceType: 'upload' })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Transcrição</h1>
        <p className="mt-1 text-sm text-slate-500">
          Envie um áudio ou vídeo (MP3/WAV/MP4) e receba a transcrição por blocos de tempo. Usa sua chave da AssemblyAI (Perfil → APIs).
        </p>
      </div>

      {/* Upload drag-and-drop */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
          dragOver ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
        }`}
      >
        {uploading ? (
          <>
            <Loader2 size={30} className="animate-spin text-cyan-400" />
            <p className="mt-3 text-sm text-slate-400">Enviando arquivo...</p>
          </>
        ) : (
          <>
            <UploadCloud size={30} className="text-cyan-400" />
            <p className="mt-3 text-sm font-medium text-slate-200">Arraste um arquivo aqui ou clique para selecionar</p>
            <p className="mt-1 text-xs text-slate-500">MP3, WAV ou MP4 · até 200MB</p>
          </>
        )}
        <input ref={fileRef} type="file" accept=".mp3,.wav,.mp4,.m4a,audio/*,video/mp4" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {/* Lista de transcrições */}
      {jobs.length === 0 ? (
        <EmptyState icon={Mic} title="Nenhuma transcrição ainda" description="Suba o primeiro arquivo para começar." />
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}

function JobCard({ job }) {
  const db = useDb()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const running = ['preparing', 'transcribing'].includes(job.status)

  async function copyAll() {
    await navigator.clipboard.writeText(job.text || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function fmtMs(ms) {
    const s = Math.floor(ms / 1000)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40">
      <div className="flex items-center gap-3 px-5 py-4">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            job.status === 'done' ? 'bg-green-500/10 text-green-400' : job.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-cyan-500/10 text-cyan-400'
          }`}
        >
          {running ? <Loader2 size={18} className="animate-spin" /> : job.status === 'done' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-200">{job.fileName}</p>
          <p className="text-xs text-slate-500">
            {STATUS_LABEL[job.status] || job.status}
            {job.errorMessage ? ` — ${job.errorMessage}` : ''}
          </p>
        </div>
        {job.status === 'done' && (
          <div className="flex items-center gap-1.5">
            <button onClick={copyAll} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs`}>
              <Copy size={12} />
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
            <button onClick={() => downloadFile(`${job.fileName}.txt`, job.text || '')} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs`}>
              <FileDown size={12} />
              TXT
            </button>
            <button onClick={() => downloadFile(`${job.fileName}.srt`, generateSrt(job.text || ''))} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 text-xs`}>
              <Captions size={12} />
              SRT
            </button>
            <button onClick={() => setExpanded((v) => !v)} className={`${btnGhost} !px-2.5 !py-1.5 text-xs`}>
              {expanded ? 'Ocultar' : 'Ver blocos'}
            </button>
          </div>
        )}
        <button onClick={() => db.remove('transcriptions', job.id)} className="text-slate-600 hover:text-red-400" title="Excluir">
          <Trash2 size={15} />
        </button>
      </div>

      {expanded && job.blocks?.length > 0 && (
        <div className="max-h-96 space-y-2 overflow-y-auto border-t border-slate-800 p-4">
          {job.blocks.map((b, i) => (
            <div key={i} className="flex gap-3 rounded-lg bg-slate-950 p-3">
              <span className="shrink-0 font-mono text-[11px] text-cyan-400">{fmtMs(b.start)}</span>
              <p className="flex-1 text-sm leading-relaxed text-slate-300">{b.text}</p>
              <button onClick={() => navigator.clipboard.writeText(b.text)} className="shrink-0 self-start text-slate-600 hover:text-slate-300" title="Copiar bloco">
                <Copy size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
