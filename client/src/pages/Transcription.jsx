import { useEffect, useRef, useState } from 'react'
import { UploadCloud, Loader2, Mic, Copy, FileDown, Captions, Trash2, CheckCircle2, AlertTriangle, Save } from 'lucide-react'
import { useDb } from '../lib/db'
import { api, apiErrorMessage } from '../lib/api'
import { btnGhost, btnPrimary } from '../components/ui'
import { downloadFile, generateSrt } from '../lib/text'

const STATUS_LABEL = {
  preparing: 'Preparando áudio',
  transcribing: 'Transcrevendo',
  done: 'Pronto',
  error: 'Erro',
}

const SEVEN_DAYS = 7 * 24 * 3600 * 1000

// Config dos 3 formatos de legenda (como no original)
const SRT_DEFAULT = { blockMin: 3, blockMax: 8, legendaMax: 5, porPalavra: 5, formato: 'Aa' }

// ---------------------------------------------------------------------------
// Geradores de SRT a partir das palavras com timestamp (ms)
// ---------------------------------------------------------------------------
function srtTime(ms) {
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')
  const mi = String(ms % 1000).padStart(3, '0')
  return `${h}:${m}:${s},${mi}`
}

function applyCase(text, formato) {
  if (formato === 'AA') return text.toUpperCase()
  if (formato === 'aa') return text.toLowerCase()
  return text
}

function blocksToSrt(blocks, formato) {
  return blocks
    .map((b, i) => `${i + 1}\n${srtTime(b.start)} --> ${srtTime(b.end)}\n${applyCase(b.text.trim(), formato)}\n`)
    .join('\n')
}

// Por tempo (VEO · SYNC): blocos de X a Y segundos — p/ sincronizar com vídeos
function srtByTime(words, minS, maxS, formato) {
  const blocks = []
  let cur = null
  for (const w of words) {
    if (!cur) {
      cur = { start: w.s, end: w.e, text: w.t }
      continue
    }
    const duration = (w.e - cur.start) / 1000
    if (duration > maxS) {
      blocks.push(cur)
      cur = { start: w.s, end: w.e, text: w.t }
    } else {
      cur.end = w.e
      cur.text += ` ${w.t}`
      // se já passou do mínimo e a próxima pausa é natural, também pode cortar
    }
  }
  if (cur) blocks.push(cur)
  // garante mínimo: funde blocos finais menores que minS com o anterior
  const merged = []
  for (const b of blocks) {
    const prev = merged[merged.length - 1]
    if (prev && (b.end - b.start) / 1000 < minS && (b.end - prev.start) / 1000 <= maxS + 2) {
      prev.end = b.end
      prev.text += ` ${b.text}`
    } else merged.push(b)
  }
  return blocksToSrt(merged, formato)
}

// Legenda: quebra no ritmo da fala (pausas), com máximo de palavras por linha
function srtLegenda(words, maxWords, formato) {
  const blocks = []
  let cur = null
  let count = 0
  for (const w of words) {
    const pause = cur && w.s - cur.end > 450
    if (!cur || pause || count >= maxWords) {
      if (cur) blocks.push(cur)
      cur = { start: w.s, end: w.e, text: w.t }
      count = 1
    } else {
      cur.end = w.e
      cur.text += ` ${w.t}`
      count++
    }
  }
  if (cur) blocks.push(cur)
  return blocksToSrt(blocks, formato)
}

// Por palavra: toda linha com a MESMA quantidade de palavras
function srtByWord(words, n, formato) {
  const blocks = []
  for (let i = 0; i < words.length; i += n) {
    const slice = words.slice(i, i + n)
    blocks.push({ start: slice[0].s, end: slice[slice.length - 1].e, text: slice.map((w) => w.t).join(' ') })
  }
  return blocksToSrt(blocks, formato)
}

export default function Transcription() {
  const db = useDb()
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState(false)
  const [cfg, setCfg] = useState(() => ({ ...SRT_DEFAULT, ...(JSON.parse(localStorage.getItem('noctis_srt_cfg') || 'null') || {}) }))
  const fileRef = useRef(null)
  const pollRef = useRef(null)

  // "Disponíveis por 7 dias" — como no original
  const jobs = [...db.all('transcriptions')].filter((j) => Date.now() - j.createdAt < SEVEN_DAYS).sort((a, b) => b.createdAt - a.createdAt)
  const latestDone = jobs.find((j) => j.status === 'done')

  function set(k, v) {
    setCfg((c) => ({ ...c, [k]: v }))
  }

  function saveDefault() {
    localStorage.setItem('noctis_srt_cfg', JSON.stringify(cfg))
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 1800)
  }

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
              words: data.words || null,
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
      // upload direto do navegador para a AssemblyAI (BYOK)
      const { id } = await api.transcription.create(file)
      db.insert('transcriptions', { fileName: file.name, remoteId: id, status: 'preparing', sourceType: 'upload' })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Transcrição</h1>
        <p className="mt-1 text-sm text-slate-500">Transforme áudio em legendas SRT e texto</p>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ------------------------- Coluna esquerda ------------------------- */}
        <div className="space-y-4">
          {/* Áudio de origem */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Áudio de origem</p>
              <span className="text-[10px] font-medium tracking-wide text-slate-600">MP3, WAV, M4A, OGG, WEBM, FLAC</span>
            </div>
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
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                dragOver ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
              }`}
            >
              {uploading ? (
                <>
                  <Loader2 size={28} className="animate-spin text-cyan-400" />
                  <p className="mt-3 text-sm text-slate-400">Enviando arquivo...</p>
                </>
              ) : (
                <>
                  <UploadCloud size={28} className="text-cyan-400" />
                  <p className="mt-3 text-sm font-medium text-slate-200">Clique ou arraste o áudio aqui</p>
                  <p className="mt-1 text-xs text-slate-500">Até 1 hora de áudio. Acima de 2 MB, envie em MP3.</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.webm,.flac,audio/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>

          {/* Legenda (SRT) — 3 formatos, como no original */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Legenda (SRT)</p>
              <button onClick={saveDefault} className="flex items-center gap-1.5 text-[11px] font-medium text-cyan-400 hover:text-cyan-300">
                <Save size={11} />
                {savedMsg ? 'Salvo!' : 'Salvar como padrão'}
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">Geramos 3 formatos de legenda. Ajuste cada um conforme seu editor:</p>

            <div className="space-y-2.5">
              {/* Por tempo (VEO · SYNC) */}
              <FormatRow
                emoji="⏱"
                title="Por tempo"
                badge="VEO · SYNC"
                desc="Uso exclusivo para SINCRONIZAÇÃO: divide a narração em blocos de X segundos. Você cria os prompts por bloco e depois sincroniza com os vídeos (VEO/Shorts)."
                control={
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max={cfg.blockMax}
                      value={cfg.blockMin}
                      onChange={(e) => set('blockMin', Math.max(1, Number(e.target.value) || 1))}
                      className="w-12 rounded-md border border-slate-800 bg-slate-950 px-1.5 py-1 text-center text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                    />
                    <span className="text-xs text-slate-500">–</span>
                    <input
                      type="number"
                      min={cfg.blockMin}
                      max="60"
                      value={cfg.blockMax}
                      onChange={(e) => set('blockMax', Math.max(cfg.blockMin, Number(e.target.value) || cfg.blockMin))}
                      className="w-12 rounded-md border border-slate-800 bg-slate-950 px-1.5 py-1 text-center text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                    />
                    <span className="text-xs text-slate-500">s</span>
                  </div>
                }
              />
              {/* Legenda */}
              <FormatRow
                emoji="¶"
                title="Legenda"
                badge={`máx. ${cfg.legendaMax}`}
                desc="Quebra no ritmo da fala, respeitando pausas. Leitura confortável."
                control={
                  <input
                    type="number"
                    min="2"
                    max="12"
                    value={cfg.legendaMax}
                    onChange={(e) => set('legendaMax', Math.max(2, Number(e.target.value) || 2))}
                    className="w-14 rounded-md border border-slate-800 bg-slate-950 px-1.5 py-1 text-center text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                  />
                }
              />
              {/* Por palavra */}
              <FormatRow
                emoji="#"
                title="Por palavra"
                badge={String(cfg.porPalavra)}
                desc="Toda linha com a MESMA quantidade de palavras. Visual uniforme."
                control={
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={cfg.porPalavra}
                    onChange={(e) => set('porPalavra', Math.max(1, Number(e.target.value) || 1))}
                    className="w-14 rounded-md border border-slate-800 bg-slate-950 px-1.5 py-1 text-center text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                  />
                }
              />
            </div>

            {/* Formato de caixa: Aa / AA / aa */}
            <div className="mt-3 flex items-center gap-2 border-t border-slate-800 pt-3">
              <span className="text-xs font-semibold text-slate-400">Formato</span>
              {['Aa', 'AA', 'aa'].map((f) => (
                <button
                  key={f}
                  onClick={() => set('formato', f)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
                    cfg.formato === f ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => fileRef.current?.click()} disabled={uploading} className={`${btnPrimary} flex w-full items-center justify-center gap-2 disabled:opacity-60`}>
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
            Transcrever
          </button>
        </div>

        {/* ------------------------- Coluna direita ------------------------- */}
        <div className="space-y-4">
          {/* Resultados */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Resultados</p>
              <span className="text-[10px] text-slate-600">Disponíveis por 7 dias</span>
            </div>
            {!latestDone ? (
              <div className="rounded-xl border border-dashed border-slate-800 px-5 py-12 text-center">
                <Captions size={24} className="mx-auto text-slate-600" />
                <p className="mt-3 text-sm font-medium text-slate-300">Pronto para transcrever</p>
                <p className="mt-1 text-xs text-slate-500">Envie um áudio e clique em Transcrever.</p>
              </div>
            ) : (
              <ResultPanel job={latestDone} cfg={cfg} />
            )}
          </div>

          {/* Últimas transcrições */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Últimas transcrições</p>
              <span className="text-[10px] text-slate-600">Disponíveis por 7 dias</span>
            </div>
            {jobs.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">Nenhuma transcrição nas últimas 24 horas.</p>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} cfg={cfg} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function FormatRow({ emoji, title, badge, desc, control }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded bg-cyan-500/10 text-xs text-cyan-400">{emoji}</span>
        <p className="text-xs font-bold text-slate-200">{title}</p>
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold text-cyan-300">{badge}</span>
        <div className="ml-auto">{control}</div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{desc}</p>
    </div>
  )
}

// Painel do resultado mais recente: baixa os 3 SRTs + TXT
function ResultPanel({ job, cfg }) {
  const [copied, setCopied] = useState(false)
  const words = job.words || []
  const base = job.fileName.replace(/\.[a-z0-9]+$/i, '')

  async function copyAll() {
    await navigator.clipboard.writeText(job.text || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function dl(kind) {
    if (!words.length) {
      // job antigo sem timestamps por palavra — usa o SRT estimado pelo texto
      downloadFile(`${base}.srt`, generateSrt(applyCase(job.text || '', cfg.formato)))
      return
    }
    if (kind === 'tempo') downloadFile(`${base}-tempo.srt`, srtByTime(words, cfg.blockMin, cfg.blockMax, cfg.formato))
    if (kind === 'legenda') downloadFile(`${base}-legenda.srt`, srtLegenda(words, cfg.legendaMax, cfg.formato))
    if (kind === 'palavra') downloadFile(`${base}-por-palavra.srt`, srtByWord(words, cfg.porPalavra, cfg.formato))
  }

  const isEmpty = !job.text || !job.text.trim()

  return (
    <div>
      <p className="truncate text-xs font-semibold text-slate-300">{job.fileName}</p>
      {isEmpty && (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-300">
          ⚠️ A transcrição concluiu, mas voltou <b>vazia</b> (sem texto reconhecido). Causas comuns: áudio sem fala clara, muito curto,
          ou idioma não detectado. Exclua esta transcrição, reenvie o áudio em <b>MP3 com fala nítida</b> e tente de novo. Se persistir com
          um áudio bom, confira sua chave da AssemblyAI em Perfil → APIs (o plano gratuito exige a chave ativada).
        </p>
      )}
      <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-3">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-400">{applyCase(job.text || '', cfg.formato) || '(vazio)'}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button onClick={() => dl('tempo')} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 !text-[11px]`}>
          ⏱ SRT por tempo
        </button>
        <button onClick={() => dl('legenda')} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 !text-[11px]`}>
          ¶ SRT legenda
        </button>
        <button onClick={() => dl('palavra')} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 !text-[11px]`}>
          # SRT por palavra
        </button>
        <button onClick={() => downloadFile(`${base}.txt`, job.text || '')} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 !text-[11px]`}>
          <FileDown size={11} />
          TXT
        </button>
        <button onClick={copyAll} className={`${btnGhost} flex items-center gap-1.5 !px-2.5 !py-1.5 !text-[11px]`}>
          <Copy size={11} />
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      {!words.length && (
        <p className="mt-2 text-[10px] text-amber-400/80">Transcrição antiga sem timestamps por palavra — os formatos usam tempo estimado.</p>
      )}
    </div>
  )
}

function JobRow({ job }) {
  const db = useDb()
  const running = ['preparing', 'transcribing'].includes(job.status)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          job.status === 'done' ? 'bg-green-500/10 text-green-400' : job.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-cyan-500/10 text-cyan-400'
        }`}
      >
        {running ? <Loader2 size={15} className="animate-spin" /> : job.status === 'done' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-200">{job.fileName}</p>
        <p className="text-[10px] text-slate-500">
          {STATUS_LABEL[job.status] || job.status}
          {job.errorMessage ? ` — ${job.errorMessage}` : ''}
          {' · '}
          {new Date(job.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <button onClick={() => db.remove('transcriptions', job.id)} className="shrink-0 text-slate-600 hover:text-red-400" title="Excluir">
        <Trash2 size={14} />
      </button>
    </div>
  )
}
