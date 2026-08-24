import { useCallback, useEffect, useRef, useState } from 'react'
import { Scissors, Upload, Download, Loader2, Wand2, SlidersHorizontal, Volume2, Filter, Waves, X, AudioLines, AlertTriangle, Info } from 'lucide-react'
import { useI18n } from '../i18n'
import { decodeAudioFile, analyze, render, encodeWav, qualityWarnings, fmtDuration } from '../lib/silenceRemoval'

// Presets por tipo de áudio → ajustam os parâmetros de detecção (modo manual).
const PRESETS = {
  narrative: { thresholdDb: -42, minSilence: 0.8, pad: 0.18 },
  informative: { thresholdDb: -40, minSilence: 0.5, pad: 0.1 },
  podcast: { thresholdDb: -41, minSilence: 0.6, pad: 0.14 },
}

export default function SilenceRemover() {
  const { t } = useI18n()
  const [file, setFile] = useState(null)
  const [buffer, setBuffer] = useState(null)
  const [decoding, setDecoding] = useState(false)
  const [origUrl, setOrigUrl] = useState(null)

  const [mode, setMode] = useState('auto') // 'auto' | 'manual'
  const [preset, setPreset] = useState(null)
  const [thresholdDb, setThresholdDb] = useState(-40)
  const [minSilence, setMinSilence] = useState(0.7)
  const [pad, setPad] = useState(0.12)
  const [enh, setEnh] = useState({ normalize: true, highpass: false, smooth: true })

  const [analysis, setAnalysis] = useState(null)
  const [regions, setRegions] = useState([])
  const [result, setResult] = useState(null)
  const [outUrl, setOutUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const renderToken = useRef(0)
  const outUrlRef = useRef(null)

  useEffect(() => () => { if (origUrl) URL.revokeObjectURL(origUrl); if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current) }, [origUrl])

  async function onFile(f) {
    if (!f) return
    setError(''); setResult(null); setAnalysis(null); setRegions([])
    if (outUrlRef.current) { URL.revokeObjectURL(outUrlRef.current); outUrlRef.current = null; setOutUrl(null) }
    if (origUrl) URL.revokeObjectURL(origUrl)
    setFile(f); setOrigUrl(URL.createObjectURL(f)); setBuffer(null); setDecoding(true)
    try {
      const buf = await decodeAudioFile(f)
      setBuffer(buf)
    } catch {
      setError(t('silence.decodeError')); setFile(null)
    } finally {
      setDecoding(false)
    }
  }

  const doRender = useCallback(async (buf, regs, enhance) => {
    const token = ++renderToken.current
    setBusy(true)
    try {
      const res = await render(buf, regs, enhance)
      if (token !== renderToken.current) return // render mais novo já começou
      const blob = encodeWav(res.channels, res.sampleRate)
      if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current)
      const url = URL.createObjectURL(blob)
      outUrlRef.current = url
      setOutUrl(url); setResult(res)
    } catch {
      setError(t('silence.processError'))
    } finally {
      if (token === renderToken.current) setBusy(false)
    }
  }, [t])

  // Analisa (detecta silêncios) quando muda o áudio ou os parâmetros de detecção.
  useEffect(() => {
    if (!buffer) return
    const a = analyze(buffer, { mode, thresholdDb, minSilenceSec: minSilence, padSec: pad })
    setAnalysis(a)
    setRegions(a.regions.map((r) => ({ ...r })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, mode, thresholdDb, minSilence, pad])

  // Renderiza (aplica cortes + melhorias) quando muda a análise, as edições de
  // região ou as melhorias — com um pequeno debounce.
  useEffect(() => {
    if (!buffer || !analysis) return
    const id = setTimeout(() => doRender(buffer, regions, enh), 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, regions, enh, buffer])

  function toggleRegion(idx) {
    setRegions((rs) => rs.map((r, i) => (i === idx ? { ...r, enabled: !r.enabled } : r)))
  }
  function applyPreset(key) {
    setPreset(key); setMode('manual')
    const p = PRESETS[key]
    setThresholdDb(p.thresholdDb); setMinSilence(p.minSilence); setPad(p.pad)
  }
  function clearFile() {
    setFile(null); setBuffer(null); setAnalysis(null); setRegions([]); setResult(null)
    if (origUrl) { URL.revokeObjectURL(origUrl); setOrigUrl(null) }
    if (outUrlRef.current) { URL.revokeObjectURL(outUrlRef.current); outUrlRef.current = null; setOutUrl(null) }
  }

  const downloadName = (file?.name || 'audio').replace(/\.[^.]+$/, '') + '-sem-silencio.wav'
  const pctSaved = result && result.originalSec > 0 ? Math.round((result.removedSec / result.originalSec) * 100) : 0
  const warnings = result ? qualityWarnings(result) : []
  const activeCuts = regions.filter((r) => r.enabled).length

  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400"><Scissors size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('silence.title')}</h1>
          <p className="text-sm text-slate-500">{t('silence.subtitle')}</p>
        </div>
      </div>

      {!file ? (
        <button onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 py-16 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300">
          <Upload size={26} />
          <span className="text-sm font-medium">{t('silence.upload')}</span>
          <span className="text-[11px] text-slate-500">{t('silence.uploadHint')}</span>
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <AudioLines size={18} className="shrink-0 text-cyan-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-200">{file.name}</p>
            <p className="text-[11px] text-slate-500">{decoding ? t('silence.decoding') : buffer ? `${fmtDuration(buffer.length / buffer.sampleRate)} · ${buffer.sampleRate} Hz` : ''}</p>
          </div>
          <button onClick={clearFile} className="text-slate-500 hover:text-red-400"><X size={16} /></button>
        </div>
      )}
      <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {buffer && analysis && (
        <>
          {/* Forma de onda editável */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-100">{t('silence.waveform')}</h2>
              <span className="text-[11px] text-slate-500">{t('silence.waveformHint')}</span>
            </div>
            <Waveform peaks={analysis.peaks} durationSec={analysis.durationSec} thresholdDb={analysis.thresholdDb} regions={regions} onToggle={toggleRegion} />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500/40" /> {t('silence.legendCut')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-slate-500" /> {t('silence.legendKept')}</span>
              <span>{t('silence.activeCuts', { n: activeCuts })}</span>
            </div>
          </div>

          {/* Modo + presets */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                <button onClick={() => { setMode('auto'); setPreset(null) }} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'auto' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}><Wand2 size={13} /> {t('silence.modeAuto')}</button>
                <button onClick={() => setMode('manual')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'manual' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}><SlidersHorizontal size={13} /> {t('silence.modeManual')}</button>
              </div>
              <span className="text-[11px] text-slate-500">{t('silence.presets')}:</span>
              {Object.keys(PRESETS).map((k) => (
                <button key={k} onClick={() => applyPreset(k)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${preset === k ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}>{t(`silence.preset.${k}`)}</button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">{mode === 'auto' ? t('silence.autoDesc') : t('silence.manualDesc')}</p>

            {mode === 'manual' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Slider label={t('silence.threshold')} hint={t('silence.thresholdHint')} value={thresholdDb} min={-60} max={-20} step={1} suffix=" dB" onChange={(v) => { setThresholdDb(v); setPreset(null) }} />
                <Slider label={t('silence.minSilence')} hint={t('silence.minSilenceHint')} value={minSilence} min={0.2} max={2} step={0.05} suffix=" s" onChange={(v) => { setMinSilence(v); setPreset(null) }} />
                <Slider label={t('silence.pad')} hint={t('silence.padHint')} value={pad} min={0} max={0.4} step={0.02} suffix=" s" onChange={(v) => { setPad(v); setPreset(null) }} />
              </div>
            )}
            {mode === 'auto' && <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-400"><Info size={12} className="text-cyan-400" /> {t('silence.autoExplain', { db: Math.round(analysis.thresholdDb), s: analysis.minSilenceSec })}</p>}
          </div>

          {/* Melhorias de áudio (explicadas) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <h2 className="text-sm font-bold text-slate-100">{t('silence.enhTitle')}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <EnhCard Icon={Volume2} on={enh.normalize} onToggle={() => setEnh((e) => ({ ...e, normalize: !e.normalize }))} title={t('silence.normalize')} what={t('silence.normalizeWhat')} why={t('silence.normalizeWhy')} />
              <EnhCard Icon={Filter} on={enh.highpass} onToggle={() => setEnh((e) => ({ ...e, highpass: !e.highpass }))} title={t('silence.highpass')} what={t('silence.highpassWhat')} why={t('silence.highpassWhy')} />
              <EnhCard Icon={Waves} on={enh.smooth} onToggle={() => setEnh((e) => ({ ...e, smooth: !e.smooth }))} title={t('silence.smooth')} what={t('silence.smoothWhat')} why={t('silence.smoothWhy')} />
            </div>
          </div>

          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

          {/* Resultado */}
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">{t('silence.result')}</h2>
              {busy && <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><Loader2 size={12} className="animate-spin" /> {t('silence.processing')}</span>}
            </div>

            {result && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <Stat label={t('silence.original')} value={fmtDuration(result.originalSec)} />
                  <Stat label={t('silence.newDur')} value={fmtDuration(result.newSec)} accent />
                  <Stat label={t('silence.removed')} value={`${fmtDuration(result.removedSec)} (${pctSaved}%)`} />
                  <Stat label={t('silence.cuts')} value={String(result.cuts)} />
                </div>

                {/* Verificação objetiva de qualidade */}
                {warnings.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {warnings.map((w) => (
                      <p key={w} className="inline-flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                        <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {t(`silence.warn.${w}`)}
                      </p>
                    ))}
                  </div>
                )}

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
                <p className="mt-2 text-[11px] text-slate-500">{t('silence.earCheck')}</p>

                {outUrl && (
                  <a href={outUrl} download={downloadName} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
                    <Download size={16} /> {t('silence.download')}
                  </a>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// Forma de onda em canvas: desenha os altos/baixos, destaca os cortes ativos
// (vermelho) e os cortes desligados (contorno). Clique num trecho alterna.
function Waveform({ peaks, durationSec, thresholdDb, regions, onToggle }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [w, setW] = useState(900)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !peaks) return
    const H = 104
    const dpr = window.devicePixelRatio || 1
    cv.width = w * dpr; cv.height = H * dpr; cv.style.width = w + 'px'; cv.style.height = H + 'px'
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, H)
    const mid = H / 2
    // forma de onda
    ctx.fillStyle = '#475569'
    for (let x = 0; x < w; x++) {
      const p = peaks[Math.floor((x / w) * peaks.length)] || 0
      const h = Math.max(0.5, p * (mid - 2))
      ctx.fillRect(x, mid - h, 1, h * 2)
    }
    // linha do limiar (abaixo disso = silêncio)
    const thrAmp = Math.pow(10, thresholdDb / 20)
    ctx.strokeStyle = 'rgba(148,163,184,0.35)'
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(0, mid - thrAmp * (mid - 2)); ctx.lineTo(w, mid - thrAmp * (mid - 2))
    ctx.moveTo(0, mid + thrAmp * (mid - 2)); ctx.lineTo(w, mid + thrAmp * (mid - 2)); ctx.stroke()
    ctx.setLineDash([])
    // regiões
    for (const r of regions) {
      const x0 = (r.startSec / durationSec) * w
      const x1 = (r.endSec / durationSec) * w
      if (r.enabled) { ctx.fillStyle = 'rgba(239,68,68,0.28)'; ctx.fillRect(x0, 0, Math.max(1.5, x1 - x0), H) }
      else { ctx.strokeStyle = 'rgba(148,163,184,0.6)'; ctx.strokeRect(x0 + 0.5, 1, Math.max(1, x1 - x0 - 1), H - 2) }
    }
  }, [peaks, regions, w, durationSec, thresholdDb])

  function onClick(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    const sec = ((e.clientX - rect.left) / rect.width) * durationSec
    const idx = regions.findIndex((r) => sec >= r.startSec && sec <= r.endSec)
    if (idx >= 0) onToggle(idx)
  }

  return (
    <div ref={wrapRef}>
      <canvas ref={canvasRef} onClick={onClick} className="w-full cursor-pointer rounded-lg bg-slate-950" title="" />
    </div>
  )
}

function EnhCard({ Icon, on, onToggle, title, what, why }) {
  return (
    <button onClick={onToggle} className={`rounded-xl border p-3 text-left transition-colors ${on ? 'border-cyan-500/40 bg-cyan-500/[0.06]' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'}`}>
      <div className="flex items-center gap-2">
        <Icon size={15} className={on ? 'text-cyan-300' : 'text-slate-500'} />
        <span className={`text-xs font-semibold ${on ? 'text-cyan-200' : 'text-slate-300'}`}>{title}</span>
        <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold ${on ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-500'}`}>{on ? 'ON' : 'OFF'}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-slate-400">{what}</p>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{why}</p>
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

function Stat({ label, value, accent }) {
  return (
    <div>
      <p className={`text-lg font-bold ${accent ? 'text-emerald-300' : 'text-slate-100'}`}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  )
}
