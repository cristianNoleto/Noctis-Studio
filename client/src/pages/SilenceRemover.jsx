import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Scissors, Upload, Download, Loader2, Wand2, SlidersHorizontal, Volume2, Filter, Waves, X, AudioLines, AlertTriangle, Info, ZoomIn, ZoomOut, Sparkles, Eraser, Captions } from 'lucide-react'
import { useI18n } from '../i18n'
import { api, apiErrorMessage } from '../lib/api'
import { decodeAudioFile, audioBufferToMono, analyze, render, regionsFromWords, encodeWav, encodeMp3, qualityWarnings, suggestEnhancements, computePeaks, fmtDuration } from '../lib/silenceRemoval'

const PRESETS = {
  narrative: { thresholdDb: -42, minSilence: 0.8, pad: 0.18 },
  informative: { thresholdDb: -40, minSilence: 0.5, pad: 0.1 },
  podcast: { thresholdDb: -41, minSilence: 0.6, pad: 0.14 },
}

// Limites de segurança (áudio vira Float32 na RAM + o WAV realoca tudo): acima
// disso o navegador pode travar/estourar memória. Bloqueamos com aviso claro.
const MAX_FILE_MB = 100
const MAX_MINUTES = 90

export default function SilenceRemover() {
  const { t } = useI18n()
  const [file, setFile] = useState(null)
  const [buffer, setBuffer] = useState(null)
  const [decoding, setDecoding] = useState(false)
  const [origUrl, setOrigUrl] = useState(null)

  const [mode, setMode] = useState('auto')
  const [preset, setPreset] = useState(null)
  const [thresholdDb, setThresholdDb] = useState(-40)
  const [minSilence, setMinSilence] = useState(0.7)
  const [pad, setPad] = useState(0.12)
  const [enh, setEnh] = useState({ normalize: true, highpass: false, smooth: true })
  const [suggested, setSuggested] = useState(false)

  const [analysis, setAnalysis] = useState(null)
  const [detected, setDetected] = useState([]) // cortes detectados (auto)
  const [manual, setManual] = useState([]) // cortes criados pela pessoa
  const [selected, setSelected] = useState(null) // corte selecionado (p/ Delete)
  const [result, setResult] = useState(null)
  const [outUrl, setOutUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [format, setFormat] = useState('wav') // 'wav' | 'mp3'
  const [encoding, setEncoding] = useState(false)
  const [error, setError] = useState('')
  const [words, setWords] = useState(null) // transcrição (modo inteligente)
  const [transcribing, setTranscribing] = useState(null) // status do job
  const [transcribeErr, setTranscribeErr] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const pollRef = useRef({ cancel: false })
  const inputRef = useRef(null)
  const outUrlRef = useRef(null)
  const beforeAudioRef = useRef(null)
  const afterAudioRef = useRef(null)

  const mono = useMemo(() => (buffer ? audioBufferToMono(buffer) : null), [buffer])
  const sr = buffer?.sampleRate || 44100

  useEffect(() => () => { if (origUrl) URL.revokeObjectURL(origUrl); if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current) }, [origUrl])

  async function onFile(f) {
    if (!f) return
    // Guarda 1: tamanho do arquivo (antes de qualquer alocação pesada).
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(t('silence.tooLarge', { mb: MAX_FILE_MB, size: Math.round(f.size / 1024 / 1024) }))
      return
    }
    pollRef.current.cancel = true // cancela qualquer transcrição em voo do arquivo anterior
    setError(''); setResult(null); setAnalysis(null); setDetected([]); setManual([]); setDirty(false); setSuggested(false)
    setWords(null); setTranscribing(null); setTranscribeErr('')
    if (outUrlRef.current) { URL.revokeObjectURL(outUrlRef.current); outUrlRef.current = null; setOutUrl(null) }
    if (origUrl) URL.revokeObjectURL(origUrl)
    setFile(f); setOrigUrl(URL.createObjectURL(f)); setBuffer(null); setDecoding(true)
    try {
      const buf = await decodeAudioFile(f)
      // Guarda 2: duração (o WAV de saída aloca ~ minutos × canais × sampleRate × 2 bytes).
      if (buf.length / buf.sampleRate > MAX_MINUTES * 60) {
        setError(t('silence.tooLong', { min: MAX_MINUTES }))
        setFile(null); setBuffer(null)
        return
      }
      setBuffer(buf)
      const a0 = analyze(buf, { mode: 'auto' })
      suggestEnhancements(buf, a0.regions.length > 0).then((s) => { setEnh(s); setSuggested(true) }).catch(() => {})
    } catch {
      setError(t('silence.decodeError')); setFile(null)
    } finally {
      setDecoding(false)
    }
  }

  // Detecta os silêncios quando muda o áudio ou os parâmetros (só a DETECÇÃO —
  // não processa o áudio final; isso é no botão). Cortes manuais são preservados.
  useEffect(() => {
    if (!buffer) return
    // A análise por RMS sempre roda (dá a forma de onda + limiar). No modo
    // inteligente, os CORTES vêm das lacunas entre palavras (se já transcreveu).
    const a = analyze(buffer, { mode: mode === 'manual' ? 'manual' : 'auto', thresholdDb, minSilenceSec: minSilence, padSec: pad })
    setAnalysis(a)
    if (mode === 'smart') {
      setDetected(words ? regionsFromWords(words, a.durationSec, buffer.sampleRate, { minSilenceSec: minSilence, padSec: pad }) : [])
    } else {
      setDetected(a.regions.map((r) => ({ ...r })))
    }
    if (result) setDirty(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, mode, thresholdDb, minSilence, pad, words])

  // Modo inteligente: transcreve o áudio (AssemblyAI, BYOK) → palavras com tempo.
  async function transcribe() {
    if (!file) return
    pollRef.current.cancel = false
    setTranscribeErr(''); setTranscribing('preparing')
    try {
      const { id } = await api.transcription.create(file)
      for (let tries = 0; tries < 200; tries++) {
        if (pollRef.current.cancel) return
        await new Promise((r) => setTimeout(r, 3000))
        if (pollRef.current.cancel) return
        const st = await api.transcription.status(id)
        setTranscribing(st.status)
        // O status vem MAPEADO: completed → 'done', error → 'error'.
        if (st.status === 'done') { setWords(st.words || []); return }
        if (st.status === 'error' || st.status === 'failed') throw new Error('failed')
      }
      throw new Error('timeout')
    } catch (e) {
      setTranscribing(null)
      setTranscribeErr(apiErrorMessage ? apiErrorMessage(e) : t('silence.transcribeError'))
    }
  }
  useEffect(() => () => { pollRef.current.cancel = true }, [])

  // Impede o navegador de ABRIR o arquivo quando ele é solto fora da caixa
  // (comportamento padrão que abria o áudio em outra aba).
  useEffect(() => {
    const prevent = (e) => { e.preventDefault() }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent) }
  }, [])

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const f = [...(e.dataTransfer?.files || [])].find((x) => (x.type || '').startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac|opus|wma)$/i.test(x.name))
    if (f) onFile(f)
    else if (e.dataTransfer?.files?.length) setError(t('silence.notAudio'))
  }

  const regions = useMemo(
    () => [...detected.map((r, i) => ({ ...r, src: 'd', i })), ...manual.map((r, i) => ({ ...r, src: 'm', i }))],
    [detected, manual],
  )

  // Pilha de desfazer (Ctrl/Cmd+Z): guarda os cortes apagados com Delete para
  // poder restaurá-los na mesma posição. Só cortes apagados — recurso de desktop.
  const undoRef = useRef([])

  function toggleRegion(ref) {
    if (ref.src === 'd') setDetected((rs) => rs.map((r, i) => (i === ref.i ? { ...r, enabled: !r.enabled } : r)))
    else setManual((rs) => rs.map((r, i) => (i === ref.i ? { ...r, enabled: !r.enabled } : r)))
    if (result) setDirty(true)
  }
  function addManual(startSec, endSec) {
    const a = Math.max(0, Math.min(startSec, endSec))
    const b = Math.min(analysis.durationSec, Math.max(startSec, endSec))
    if (b - a < 0.03) return // ignora cliques muito curtos
    setManual((rs) => [...rs, { startSec: a, endSec: b, startSample: Math.round(a * sr), endSample: Math.round(b * sr), enabled: true, manual: true }])
    if (result) setDirty(true)
  }
  function clearManual() { setManual([]); if (result) setDirty(true) }
  function deleteRegion(ref) {
    if (!ref) return
    if (ref.src === 'd')
      setDetected((rs) => {
        if (rs[ref.i]) undoRef.current.push({ src: 'd', i: ref.i, region: rs[ref.i] })
        return rs.filter((_, i) => i !== ref.i)
      })
    else
      setManual((rs) => {
        if (rs[ref.i]) undoRef.current.push({ src: 'm', i: ref.i, region: rs[ref.i] })
        return rs.filter((_, i) => i !== ref.i)
      })
    setSelected(null)
    if (result) setDirty(true)
  }
  // Desfaz o último corte apagado, reinserindo-o na posição original.
  function undoDelete() {
    const last = undoRef.current.pop()
    if (!last) return
    const reinsert = (rs) => {
      const a = [...rs]
      a.splice(Math.min(last.i, a.length), 0, last.region)
      return a
    }
    if (last.src === 'd') setDetected(reinsert)
    else setManual(reinsert)
    if (result) setDirty(true)
  }

  // Delete/Backspace apaga de vez o corte selecionado (do sistema OU manual),
  // esteja ele ativo (vermelho) ou desativado (contorno). Não intercepta digitação.
  useEffect(() => {
    if (!buffer) return
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      // Ctrl/Cmd+Z: desfaz o último corte apagado (desktop).
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (undoRef.current.length === 0) return
        e.preventDefault()
        undoDelete()
        return
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (!selected) return
      e.preventDefault()
      deleteRegion(selected)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, selected, result])

  const doRender = useCallback(async () => {
    if (!buffer) return
    // Se algum player estiver tocando, para (o áudio "depois" vai ser trocado).
    try { beforeAudioRef.current?.pause(); afterAudioRef.current?.pause() } catch { /* ignora */ }
    setBusy(true); setError('')
    await new Promise((r) => setTimeout(r, 30)) // deixa o indicador pintar antes do trabalho pesado
    try {
      const active = regions.filter((r) => r.enabled)
      const res = await render(buffer, active, enh)
      const blob = encodeWav(res.channels, res.sampleRate)
      if (outUrlRef.current) URL.revokeObjectURL(outUrlRef.current)
      const url = URL.createObjectURL(blob)
      outUrlRef.current = url
      setOutUrl(url); setResult(res); setDirty(false)
    } catch {
      setError(t('silence.processError'))
    } finally {
      setBusy(false)
    }
  }, [buffer, regions, enh, t])

  function setEnhKey(k) { setEnh((e) => ({ ...e, [k]: !e[k] })); if (result) setDirty(true) }
  function applyPreset(key) { setPreset(key); setMode('manual'); const p = PRESETS[key]; setThresholdDb(p.thresholdDb); setMinSilence(p.minSilence); setPad(p.pad) }
  function clearFile() {
    setFile(null); setBuffer(null); setAnalysis(null); setDetected([]); setManual([]); setResult(null); setDirty(false)
    if (origUrl) { URL.revokeObjectURL(origUrl); setOrigUrl(null) }
    if (outUrlRef.current) { URL.revokeObjectURL(outUrlRef.current); outUrlRef.current = null; setOutUrl(null) }
  }

  const baseName = (file?.name || 'audio').replace(/\.[^.]+$/, '') + '-sem-silencio'
  function triggerDownload(url, name) {
    const a = document.createElement('a')
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  }
  async function download() {
    if (!result) return
    if (format === 'wav') { if (outUrl) triggerDownload(outUrl, `${baseName}.wav`); return }
    setEncoding(true)
    try {
      const blob = await encodeMp3(result.channels, result.sampleRate, 128)
      const url = URL.createObjectURL(blob)
      triggerDownload(url, `${baseName}.mp3`)
      setTimeout(() => URL.revokeObjectURL(url), 15000)
    } catch {
      setError(t('silence.processError'))
    } finally {
      setEncoding(false)
    }
  }
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
        <button
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
          onDrop={onDrop}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-16 transition-colors ${dragOver ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-300'}`}
        >
          <Upload size={26} />
          <span className="text-sm font-medium">{dragOver ? t('silence.dropNow') : t('silence.upload')}</span>
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

      {buffer && analysis && mono && (
        <>
          {/* Forma de onda com zoom + edição */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-100">{t('silence.waveform')}</h2>
              <div className="flex items-center gap-3">
                {selected && (
                  <button onClick={() => deleteRegion(selected)} className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"><X size={12} /> {t('silence.deleteSelected')}</button>
                )}
                {manual.length > 0 && (
                  <button onClick={clearManual} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-400"><Eraser size={12} /> {t('silence.clearManual')}</button>
                )}
              </div>
            </div>
            <Waveform mono={mono} durationSec={analysis.durationSec} thresholdDb={analysis.thresholdDb} regions={regions} selected={selected} onToggle={toggleRegion} onSelect={setSelected} onCreate={addManual} t={t} />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500/40" /> {t('silence.legendCut')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-slate-500" /> {t('silence.legendKept')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan-500/40" /> {t('silence.legendManual')}</span>
              <span>{t('silence.activeCuts', { n: activeCuts })}</span>
            </div>
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-slate-500"><Info size={12} className="text-cyan-400" /> {t('silence.howto')}</p>
          </div>

          {/* Modo + presets */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                <button onClick={() => { setMode('auto'); setPreset(null) }} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'auto' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}><Wand2 size={13} /> {t('silence.modeAuto')}</button>
                <button onClick={() => setMode('manual')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'manual' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}><SlidersHorizontal size={13} /> {t('silence.modeManual')}</button>
                <button onClick={() => setMode('smart')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === 'smart' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}><Captions size={13} /> {t('silence.modeSmart')}</button>
              </div>
              {mode !== 'smart' && (
                <>
                  <span className="text-[11px] text-slate-500">{t('silence.presets')}:</span>
                  {Object.keys(PRESETS).map((k) => (
                    <button key={k} onClick={() => applyPreset(k)} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${preset === k ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}>{t(`silence.preset.${k}`)}</button>
                  ))}
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">{mode === 'auto' ? t('silence.autoDesc') : mode === 'manual' ? t('silence.manualDesc') : t('silence.smartDesc')}</p>

            {mode === 'manual' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Slider label={t('silence.threshold')} hint={t('silence.thresholdHint')} value={thresholdDb} min={-60} max={-20} step={1} suffix=" dB" onChange={(v) => { setThresholdDb(v); setPreset(null) }} />
                <Slider label={t('silence.minSilence')} hint={t('silence.minSilenceHint')} value={minSilence} min={0.2} max={2} step={0.05} suffix=" s" onChange={(v) => { setMinSilence(v); setPreset(null) }} />
                <Slider label={t('silence.pad')} hint={t('silence.padHint')} value={pad} min={0} max={0.4} step={0.02} suffix=" s" onChange={(v) => { setPad(v); setPreset(null) }} />
              </div>
            )}
            {mode === 'auto' && <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-400"><Info size={12} className="text-cyan-400" /> {t('silence.autoExplain', { db: Math.round(analysis.thresholdDb), s: analysis.minSilenceSec })}</p>}

            {mode === 'smart' && (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
                {!words ? (
                  <div>
                    <p className="text-[11px] leading-snug text-slate-400">{t('silence.smartExplain')}</p>
                    <button onClick={transcribe} disabled={!!transcribing} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:opacity-60">
                      {transcribing ? <Loader2 size={14} className="animate-spin" /> : <Captions size={14} />}
                      {transcribing ? t('silence.transcribing') : t('silence.transcribeBtn')}
                    </button>
                    {transcribing && <p className="mt-2 text-[11px] text-slate-500">{t('silence.transcribeWait')}</p>}
                    {transcribeErr && <p className="mt-2 text-[11px] text-red-400">{transcribeErr}</p>}
                  </div>
                ) : (
                  <div>
                    <p className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300"><Captions size={12} /> {t('silence.transcribed', { n: words.length })}</p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <Slider label={t('silence.minSilence')} hint={t('silence.minSilenceSmartHint')} value={minSilence} min={0.2} max={2} step={0.05} suffix=" s" onChange={setMinSilence} />
                      <Slider label={t('silence.pad')} hint={t('silence.padHint')} value={pad} min={0} max={0.4} step={0.02} suffix=" s" onChange={setPad} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Melhorias (auto-sugeridas) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-100">{t('silence.enhTitle')}</h2>
              {suggested && <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-300"><Sparkles size={10} /> {t('silence.autoSuggested')}</span>}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{t('silence.enhSubtitle')}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <EnhCard Icon={Volume2} on={enh.normalize} onToggle={() => setEnhKey('normalize')} title={t('silence.normalize')} what={t('silence.normalizeWhat')} why={t('silence.normalizeWhy')} />
              <EnhCard Icon={Filter} on={enh.highpass} onToggle={() => setEnhKey('highpass')} title={t('silence.highpass')} what={t('silence.highpassWhat')} why={t('silence.highpassWhy')} />
              <EnhCard Icon={Waves} on={enh.smooth} onToggle={() => setEnhKey('smooth')} title={t('silence.smooth')} what={t('silence.smoothWhat')} why={t('silence.smoothWhy')} />
            </div>
          </div>

          {/* Ação: processar (acima do preview) */}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={doRender} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
              {busy ? t('silence.processing') : result ? t('silence.regenerate') : t('silence.process')}
            </button>
            {!busy && result && dirty && <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-300"><AlertTriangle size={12} /> {t('silence.pending')}</span>}
          </div>

          {busy && (
            <div className="flex items-center gap-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2.5 text-sm text-cyan-200">
              <Loader2 size={16} className="animate-spin" /> {t('silence.reprocessing')}
            </div>
          )}
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

          {/* Resultado / preview */}
          {result && (
            <div className={`relative rounded-2xl border p-5 ${dirty ? 'border-slate-800 bg-slate-900/40' : 'border-emerald-500/25 bg-emerald-500/[0.05]'} ${busy ? 'opacity-50' : ''}`}>
              {busy && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/40">
                  <span className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-cyan-200 shadow"><Loader2 size={14} className="animate-spin" /> {t('silence.reprocessing')}</span>
                </div>
              )}
              <h2 className="text-sm font-bold text-slate-100">{t('silence.result')}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                <Stat label={t('silence.original')} value={fmtDuration(result.originalSec)} />
                <Stat label={t('silence.newDur')} value={fmtDuration(result.newSec)} accent />
                <Stat label={t('silence.removed')} value={`${fmtDuration(result.removedSec)} (${pctSaved}%)`} />
                <Stat label={t('silence.cuts')} value={String(result.cuts)} />
              </div>
              {warnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  {warnings.map((w) => (
                    <p key={w} className="inline-flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {t(`silence.warn.${w}`)}</p>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-slate-400">{t('silence.before')}</p>
                  {origUrl && <audio ref={beforeAudioRef} src={origUrl} controls className="w-full" />}
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold text-slate-400">{t('silence.after')}</p>
                  {outUrl && <audio ref={afterAudioRef} src={outUrl} controls className="w-full" />}
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">{t('silence.earCheck')}</p>
              {outUrl && !dirty && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                    <button onClick={() => setFormat('wav')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${format === 'wav' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>WAV</button>
                    <button onClick={() => setFormat('mp3')} className={`rounded-md px-3 py-1.5 font-medium transition-colors ${format === 'mp3' ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:text-slate-200'}`}>MP3</button>
                  </div>
                  <button onClick={download} disabled={encoding} className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60">
                    {encoding ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {encoding ? t('silence.encodingMp3') : t('silence.downloadFmt', { fmt: format.toUpperCase() })}
                  </button>
                  <span className="text-[11px] text-slate-500">{t('silence.fmtHint')}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Forma de onda com ZOOM (canvas maior que a caixa → scrolla na horizontal, como
// no Premiere) + edição: clique num corte alterna; arraste numa área livre cria
// um corte manual (ciano). Ctrl/⌘ + scroll dá zoom.
function Waveform({ mono, durationSec, thresholdDb, regions, selected, onToggle, onSelect, onCreate, t }) {
  const scrollRef = useRef(null)
  const canvasRef = useRef(null)
  const [baseW, setBaseW] = useState(900)
  const [zoom, setZoom] = useState(1)
  const drag = useRef(null)
  const [sel, setSel] = useState(null) // seleção temporária [xa, xb] em px do canvas

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBaseW(el.clientWidth))
    ro.observe(el); setBaseW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const H = 120
  const canvasW = Math.min(24000, Math.round(baseW * zoom))

  // Zoom com Ctrl/⌘ + scroll — listener NATIVO não-passivo (o onWheel do React é
  // passivo e ignora preventDefault, o que fazia a PÁGINA inteira dar zoom).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      setZoom((z) => Math.max(1, Math.min(40, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv || !mono) return
    const dpr = window.devicePixelRatio || 1
    cv.width = canvasW * dpr; cv.height = H * dpr; cv.style.width = canvasW + 'px'; cv.style.height = H + 'px'
    const ctx = cv.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvasW, H)
    const mid = H / 2
    const peaks = computePeaks(mono, canvasW)
    ctx.fillStyle = '#475569'
    for (let x = 0; x < canvasW; x++) {
      const h = Math.max(0.5, (peaks[x] || 0) * (mid - 3))
      ctx.fillRect(x, mid - h, 1, h * 2)
    }
    const thrAmp = Math.pow(10, thresholdDb / 20)
    ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, mid - thrAmp * (mid - 3)); ctx.lineTo(canvasW, mid - thrAmp * (mid - 3))
    ctx.moveTo(0, mid + thrAmp * (mid - 3)); ctx.lineTo(canvasW, mid + thrAmp * (mid - 3)); ctx.stroke()
    ctx.setLineDash([])
    for (const r of regions) {
      const x0 = (r.startSec / durationSec) * canvasW
      const x1 = (r.endSec / durationSec) * canvasW
      const wr = Math.max(1.5, x1 - x0)
      if (r.enabled) { ctx.fillStyle = r.manual ? 'rgba(34,211,238,0.30)' : 'rgba(239,68,68,0.28)'; ctx.fillRect(x0, 0, wr, H) }
      else { ctx.strokeStyle = 'rgba(148,163,184,0.6)'; ctx.strokeRect(x0 + 0.5, 1, Math.max(1, x1 - x0 - 1), H - 2) }
      // Destaque do corte SELECIONADO (alvo do Delete).
      if (selected && selected.src === r.src && selected.i === r.i) {
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2
        ctx.strokeRect(x0 + 1, 1, Math.max(2, wr - 2), H - 2); ctx.lineWidth = 1
      }
    }
    if (sel) { ctx.fillStyle = 'rgba(34,211,238,0.22)'; ctx.fillRect(Math.min(sel[0], sel[1]), 0, Math.abs(sel[1] - sel[0]), H) }
  }, [mono, regions, canvasW, durationSec, thresholdDb, sel, selected])

  const clampPx = (px) => Math.max(0, Math.min(canvasW, px))
  const pxOf = (clientX) => clampPx(clientX - canvasRef.current.getBoundingClientRect().left)

  // Arraste com listeners no DOCUMENTO: a seleção continua mesmo se o mouse sair
  // da forma de onda; só finaliza ao SOLTAR o botão.
  function onDown(e) {
    e.preventDefault()
    const x0 = pxOf(e.clientX)
    drag.current = { x0, moved: false }
    const move = (ev) => {
      const x = pxOf(ev.clientX)
      if (Math.abs(x - drag.current.x0) > 3) { drag.current.moved = true; setSel([drag.current.x0, x]) }
    }
    const up = (ev) => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      const d = drag.current; drag.current = null; setSel(null)
      if (!d) return
      if (d.moved) {
        const xe = pxOf(ev.clientX)
        onCreate((Math.min(d.x0, xe) / canvasW) * durationSec, (Math.max(d.x0, xe) / canvasW) * durationSec)
      } else {
        const sec = (d.x0 / canvasW) * durationSec
        const hit = regions.find((r) => sec >= r.startSec && sec <= r.endSec)
        if (hit) { onToggle({ src: hit.src, i: hit.i }); onSelect({ src: hit.src, i: hit.i }) }
        else onSelect(null)
      }
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <button onClick={() => setZoom((z) => Math.max(1, z / 1.4))} className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300" title={t('silence.zoomOut')}><ZoomOut size={14} /></button>
        <button onClick={() => setZoom((z) => Math.min(40, z * 1.4))} className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300" title={t('silence.zoomIn')}><ZoomIn size={14} /></button>
        <button onClick={() => setZoom(1)} className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200" title={t('silence.zoomReset')}>{Math.round(zoom * 100)}%</button>
      </div>
      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden rounded-lg bg-slate-950" style={{ overscrollBehaviorX: 'contain' }}>
        <canvas ref={canvasRef} onMouseDown={onDown} className="block cursor-crosshair" />
      </div>
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
