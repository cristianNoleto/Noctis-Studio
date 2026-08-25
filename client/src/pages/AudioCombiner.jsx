import { useEffect, useRef, useState } from 'react'
import { Combine, Upload, Download, Loader2, X, AudioLines, ArrowUp, ArrowDown, Volume2, Waves, AlertTriangle } from 'lucide-react'
import { useI18n } from '../i18n'
import { decodeAudioFile, encodeWav, encodeMp3, fmtDuration } from '../lib/silenceRemoval'
import { combineAudios } from '../lib/audioCombine'

const MAX_FILES = 30
const MAX_TOTAL_MB = 200
const AUDIO_RE = /\.(mp3|wav|m4a|ogg|aac|flac|opus|wma)$/i
const isAudio = (f) => (f.type || '').startsWith('audio/') || AUDIO_RE.test(f.name)

export default function AudioCombiner() {
  const { t } = useI18n()
  const [items, setItems] = useState([]) // { id, file, buffer, dur }
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [gap, setGap] = useState(0.5)
  const [padStart, setPadStart] = useState(0)
  const [padEnd, setPadEnd] = useState(0)
  const [normalize, setNormalize] = useState(false)
  const [smooth, setSmooth] = useState(true)
  const [format, setFormat] = useState('wav')
  const [result, setResult] = useState(null)
  const [outUrl, setOutUrl] = useState(null)
  const [encoding, setEncoding] = useState(false)
  const inputRef = useRef(null)
  const outUrlRef = useRef(null)

  useEffect(() => () => { if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current) }, [])
  useEffect(() => {
    const prevent = (e) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent) }
  }, [])

  async function addFiles(fileList) {
    setError('')
    const incoming = [...fileList].filter(isAudio)
    if (!incoming.length) { setError(t('combine.notAudio')); return }
    if (items.length + incoming.length > MAX_FILES) { setError(t('combine.tooMany', { n: MAX_FILES })); return }
    const curMb = items.reduce((s, it) => s + it.file.size, 0) / 1024 / 1024
    const addMb = incoming.reduce((s, f) => s + f.size, 0) / 1024 / 1024
    if (curMb + addMb > MAX_TOTAL_MB) { setError(t('combine.tooLarge', { mb: MAX_TOTAL_MB })); return }
    setBusy(true)
    try {
      const decoded = []
      for (const f of incoming) {
        try {
          const buffer = await decodeAudioFile(f)
          decoded.push({ id: crypto.randomUUID(), file: f, buffer, dur: buffer.length / buffer.sampleRate })
        } catch {
          setError(t('combine.decodeError', { name: f.name }))
        }
      }
      if (decoded.length) { setItems((cur) => [...cur, ...decoded]); setResult(null); clearOut() }
    } finally {
      setBusy(false)
    }
  }

  function clearOut() { if (outUrlRef.current) { URL.revokeObjectURL(outUrlRef.current); outUrlRef.current = null; setOutUrl(null) } }
  function move(i, dir) {
    setItems((cur) => {
      const j = i + dir
      if (j < 0 || j >= cur.length) return cur
      const next = [...cur];[next[i], next[j]] = [next[j], next[i]]; return next
    })
    setResult(null); clearOut()
  }
  function removeItem(id) { setItems((cur) => cur.filter((x) => x.id !== id)); setResult(null); clearOut() }
  function onDrop(e) { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files) }

  async function combine() {
    if (items.length < 2) return
    setBusy(true); setError(''); clearOut()
    await new Promise((r) => setTimeout(r, 30))
    try {
      const res = await combineAudios(items.map((it) => it.buffer), { gapSec: gap, padStartSec: padStart, padEndSec: padEnd, normalize, smooth })
      const blob = encodeWav(res.channels, res.sampleRate)
      const url = URL.createObjectURL(blob)
      outUrlRef.current = url
      setOutUrl(url); setResult(res)
    } catch {
      setError(t('combine.combineError'))
    } finally {
      setBusy(false)
    }
  }

  function triggerDownload(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove() }
  async function download() {
    if (!result) return
    if (format === 'wav') { if (outUrl) triggerDownload(outUrl, 'audios-combinados.wav'); return }
    setEncoding(true)
    try {
      const blob = await encodeMp3(result.channels, result.sampleRate, 128)
      const url = URL.createObjectURL(blob)
      triggerDownload(url, 'audios-combinados.mp3')
      setTimeout(() => URL.revokeObjectURL(url), 15000)
    } catch {
      setError(t('combine.combineError'))
    } finally {
      setEncoding(false)
    }
  }

  const totalIn = items.reduce((s, it) => s + it.dur, 0) + Math.max(0, items.length - 1) * gap + padStart + padEnd

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400"><Combine size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('combine.title')}</h1>
          <p className="text-sm text-slate-500">{t('combine.subtitle')}</p>
        </div>
      </div>

      {/* Upload */}
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-12 transition-colors ${dragOver ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300'}`}
      >
        <Upload size={24} />
        <span className="text-sm font-medium">{dragOver ? t('combine.dropNow') : t('combine.upload')}</span>
        <span className="text-[11px] text-slate-500">{t('combine.uploadHint')}</span>
      </button>
      <input ref={inputRef} type="file" accept="audio/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      {/* Lista de faixas */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100">{t('combine.tracks', { n: items.length })}</h2>
            <span className="text-[11px] text-slate-500">{t('combine.estimated')}: {fmtDuration(totalIn)}</span>
          </div>
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li key={it.id} className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-[11px] font-bold text-cyan-300">{i + 1}</span>
                <AudioLines size={15} className="shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{it.file.name}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{fmtDuration(it.dur)}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-cyan-300 disabled:opacity-30"><ArrowUp size={14} /></button>
                <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="text-slate-500 hover:text-cyan-300 disabled:opacity-30"><ArrowDown size={14} /></button>
                <button onClick={() => removeItem(it.id)} className="text-slate-500 hover:text-red-400"><X size={15} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Opções */}
      {items.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          <h2 className="text-sm font-bold text-slate-100">{t('combine.options')}</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Slider label={t('combine.gap')} hint={t('combine.gapHint')} value={gap} min={0} max={3} step={0.1} suffix=" s" onChange={setGap} />
            <Slider label={t('combine.padStart')} hint={t('combine.padStartHint')} value={padStart} min={0} max={3} step={0.1} suffix=" s" onChange={setPadStart} />
            <Slider label={t('combine.padEnd')} hint={t('combine.padEndHint')} value={padEnd} min={0} max={3} step={0.1} suffix=" s" onChange={setPadEnd} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <EnhCard Icon={Volume2} on={normalize} onToggle={() => setNormalize((v) => !v)} title={t('combine.normalize')} what={t('combine.normalizeWhat')} />
            <EnhCard Icon={Waves} on={smooth} onToggle={() => setSmooth((v) => !v)} title={t('combine.smooth')} what={t('combine.smoothWhat')} />
          </div>
        </div>
      )}

      {/* Ação */}
      {items.length >= 2 && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={combine} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Combine size={16} />}
            {busy ? t('combine.combining') : result ? t('combine.recombine') : t('combine.combine')}
          </button>
          {items.length < 2 && <span className="text-[11px] text-slate-500">{t('combine.needTwo')}</span>}
        </div>
      )}
      {items.length === 1 && <p className="inline-flex items-center gap-1.5 text-[11px] text-amber-300"><AlertTriangle size={12} /> {t('combine.needTwo')}</p>}

      {busy && (
        <div className="flex items-center gap-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2.5 text-sm text-cyan-200">
          <Loader2 size={16} className="animate-spin" /> {t('combine.combining')}
        </div>
      )}

      {/* Resultado */}
      {result && !busy && (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-lg font-bold text-emerald-300">{fmtDuration(result.durationSec)}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('combine.finalDur')}</p>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-100">{items.length}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('combine.tracksWord')}</p>
            </div>
          </div>
          {outUrl && <audio src={outUrl} controls className="mt-4 w-full" />}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
              <button onClick={() => setFormat('wav')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${format === 'wav' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>WAV</button>
              <button onClick={() => setFormat('mp3')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${format === 'mp3' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>MP3</button>
            </div>
            <button onClick={download} disabled={encoding} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60">
              {encoding ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {encoding ? t('combine.encodingMp3') : t('combine.downloadFmt', { fmt: format.toUpperCase() })}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function EnhCard({ Icon, on, onToggle, title, what }) {
  return (
    <button onClick={onToggle} className={`rounded-xl border p-3 text-left transition-colors ${on ? 'border-cyan-500/40 bg-cyan-500/[0.06]' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'}`}>
      <div className="flex items-center gap-2">
        <Icon size={15} className={on ? 'text-cyan-300' : 'text-slate-500'} />
        <span className={`text-xs font-semibold ${on ? 'text-cyan-200' : 'text-slate-300'}`}>{title}</span>
        <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold ${on ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-500'}`}>{on ? 'ON' : 'OFF'}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{what}</p>
    </button>
  )
}

function Slider({ label, hint, value, min, max, step, suffix, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-200">{label}</label>
        <span className="text-xs text-cyan-300">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-cyan-500" />
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{hint}</p>
    </div>
  )
}
