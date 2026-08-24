import { useEffect, useRef, useState } from 'react'
import { Scissors, Upload, Download, Loader2, Wand2, SlidersHorizontal, Volume2, X, AudioLines } from 'lucide-react'
import { useI18n } from '../i18n'
import { decodeAudioFile, removeSilence, encodeWav, fmtDuration } from '../lib/silenceRemoval'

export default function SilenceRemover() {
  const { t } = useI18n()
  const [file, setFile] = useState(null)
  const [buffer, setBuffer] = useState(null)
  const [decoding, setDecoding] = useState(false)
  const [origUrl, setOrigUrl] = useState(null)
  const [mode, setMode] = useState('auto') // 'auto' | 'manual'
  const [thresholdDb, setThresholdDb] = useState(-40)
  const [minSilence, setMinSilence] = useState(0.7)
  const [pad, setPad] = useState(0.12)
  const [normalize, setNormalize] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [outUrl, setOutUrl] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  // Limpa as object URLs pra não vazar memória.
  useEffect(() => () => { if (origUrl) URL.revokeObjectURL(origUrl); if (outUrl) URL.revokeObjectURL(outUrl) }, [origUrl, outUrl])

  async function onFile(f) {
    if (!f) return
    setError('')
    setResult(null)
    if (outUrl) { URL.revokeObjectURL(outUrl); setOutUrl(null) }
    if (origUrl) URL.revokeObjectURL(origUrl)
    setFile(f)
    setOrigUrl(URL.createObjectURL(f))
    setBuffer(null)
    setDecoding(true)
    try {
      const buf = await decodeAudioFile(f)
      setBuffer(buf)
    } catch {
      setError(t('silence.decodeError'))
      setFile(null)
    } finally {
      setDecoding(false)
    }
  }

  async function process() {
    if (!buffer) return
    setProcessing(true)
    setError('')
    if (outUrl) { URL.revokeObjectURL(outUrl); setOutUrl(null) }
    await new Promise((r) => setTimeout(r, 30)) // deixa o spinner pintar
    try {
      const res = removeSilence(buffer, { mode, thresholdDb, minSilenceSec: minSilence, padSec: pad, normalize })
      const blob = encodeWav(res.channels, res.sampleRate)
      setOutUrl(URL.createObjectURL(blob))
      setResult(res)
    } catch {
      setError(t('silence.processError'))
    } finally {
      setProcessing(false)
    }
  }

  const downloadName = (file?.name || 'audio').replace(/\.[^.]+$/, '') + '-sem-silencio.wav'
  const pctSaved = result && result.originalSec > 0 ? Math.round((result.removedSec / result.originalSec) * 100) : 0

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400"><Scissors size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('silence.title')}</h1>
          <p className="text-sm text-slate-500">{t('silence.subtitle')}</p>
        </div>
      </div>

      {/* Upload */}
      {!file ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 py-16 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <Upload size={26} />
          <span className="text-sm font-medium">{t('silence.upload')}</span>
          <span className="text-[11px] text-slate-500">{t('silence.uploadHint')}</span>
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <AudioLines size={18} className="shrink-0 text-cyan-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-200">{file.name}</p>
            <p className="text-[11px] text-slate-500">
              {decoding ? t('silence.decoding') : buffer ? `${fmtDuration(buffer.length / buffer.sampleRate)} · ${buffer.sampleRate} Hz` : ''}
            </p>
          </div>
          <button onClick={() => { setFile(null); setBuffer(null); setResult(null); if (origUrl) { URL.revokeObjectURL(origUrl); setOrigUrl(null) } if (outUrl) { URL.revokeObjectURL(outUrl); setOutUrl(null) } }} className="text-slate-500 hover:text-red-400"><X size={16} /></button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {buffer && (
        <>
          {/* Modo */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
              <button onClick={() => setMode('auto')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'auto' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>
                <Wand2 size={13} /> {t('silence.modeAuto')}
              </button>
              <button onClick={() => setMode('manual')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'manual' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>
                <SlidersHorizontal size={13} /> {t('silence.modeManual')}
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">{mode === 'auto' ? t('silence.autoDesc') : t('silence.manualDesc')}</p>

            {mode === 'manual' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Slider label={t('silence.threshold')} hint={t('silence.thresholdHint')} value={thresholdDb} min={-60} max={-20} step={1} suffix=" dB" onChange={setThresholdDb} />
                <Slider label={t('silence.minSilence')} hint={t('silence.minSilenceHint')} value={minSilence} min={0.2} max={2} step={0.05} suffix=" s" onChange={setMinSilence} />
                <Slider label={t('silence.pad')} hint={t('silence.padHint')} value={pad} min={0} max={0.4} step={0.02} suffix=" s" onChange={setPad} />
              </div>
            )}

            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-slate-300">
              <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-cyan-500" />
              <Volume2 size={15} className="text-slate-500" />
              {t('silence.normalize')}
              <span className="text-[11px] text-slate-500">— {t('silence.normalizeHint')}</span>
            </label>

            <button
              onClick={process}
              disabled={processing}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60"
            >
              {processing ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
              {processing ? t('silence.processing') : t('silence.process')}
            </button>
          </div>

          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

          {/* Resultado */}
          {result && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Stat label={t('silence.original')} value={fmtDuration(result.originalSec)} />
                <Stat label={t('silence.result')} value={fmtDuration(result.newSec)} accent />
                <Stat label={t('silence.removed')} value={`${fmtDuration(result.removedSec)} (${pctSaved}%)`} />
                <Stat label={t('silence.cuts')} value={String(result.cuts)} />
                {mode === 'auto' && <Stat label={t('silence.thresholdUsed')} value={`${Math.round(result.thresholdDb)} dB`} />}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-slate-400">{t('silence.before')}</p>
                  {origUrl && <audio src={origUrl} controls className="w-full" />}
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-slate-400">{t('silence.after')}</p>
                  {outUrl && <audio src={outUrl} controls className="w-full" />}
                </div>
              </div>

              {outUrl && (
                <a href={outUrl} download={downloadName} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
                  <Download size={16} /> {t('silence.download')}
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
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

function Stat({ label, value, accent }) {
  return (
    <div>
      <p className={`text-lg font-bold ${accent ? 'text-emerald-300' : 'text-slate-100'}`}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  )
}
