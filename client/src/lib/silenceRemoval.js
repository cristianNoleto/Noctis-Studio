// Remoção de silêncio 100% no navegador (Web Audio API). Sem servidor, sem custo.
// Duas fases: analyze() detecta os trechos silenciosos e devolve a forma de onda
// (para desenhar) + as regiões de corte (editáveis pelo usuário); render() aplica
// os cortes escolhidos + melhorias de áudio e devolve os canais prontos p/ WAV.

export async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer()
  const AC = window.AudioContext || window.webkitAudioContext
  const ctx = new AC()
  try {
    return await ctx.decodeAudioData(arrayBuffer)
  } finally {
    ctx.close?.()
  }
}

function toMono(audioBuffer) {
  const ch = audioBuffer.numberOfChannels
  const len = audioBuffer.length
  if (ch === 1) return audioBuffer.getChannelData(0)
  const out = new Float32Array(len)
  for (let c = 0; c < ch; c++) {
    const d = audioBuffer.getChannelData(c)
    for (let i = 0; i < len; i++) out[i] += d[i] / ch
  }
  return out
}

const toDb = (x) => 20 * Math.log10(Math.max(1e-8, x))
const fromDb = (db) => Math.pow(10, db / 20)

function frameRms(mono, sampleRate, frameMs = 20) {
  const frame = Math.max(1, Math.floor((sampleRate * frameMs) / 1000))
  const n = Math.ceil(mono.length / frame)
  const rms = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    const start = f * frame
    const end = Math.min(mono.length, start + frame)
    let sum = 0
    for (let i = start; i < end; i++) sum += mono[i] * mono[i]
    rms[f] = Math.sqrt(sum / Math.max(1, end - start))
  }
  return { rms, frame }
}

function autoThresholdDb(rms) {
  const dbs = Array.from(rms, toDb).sort((a, b) => a - b)
  const floor = dbs[Math.floor(dbs.length * 0.1)] ?? -60
  return Math.min(-25, floor + 8)
}

// Forma de onda: pico absoluto por "balde" (para desenhar altos e baixos).
export function computePeaks(mono, buckets = 1600) {
  const size = Math.max(1, Math.floor(mono.length / buckets))
  const peaks = new Float32Array(buckets)
  for (let b = 0; b < buckets; b++) {
    const start = b * size
    const end = Math.min(mono.length, start + size)
    let max = 0
    for (let i = start; i < end; i++) { const a = Math.abs(mono[i]); if (a > max) max = a }
    peaks[b] = max
  }
  return peaks
}

// Detecta os silêncios longos e devolve as REGIÕES a remover (o miolo, já com a
// folga aplicada), a forma de onda e o limiar usado. Nada é cortado ainda.
export function analyze(audioBuffer, opts = {}) {
  const sr = audioBuffer.sampleRate
  const mono = toMono(audioBuffer)
  const { rms, frame } = frameRms(mono, sr, 20)
  const thresholdDb = opts.mode === 'auto' ? autoThresholdDb(rms) : opts.thresholdDb ?? -40
  const minSilenceSec = opts.mode === 'auto' ? 0.5 : Math.max(0.05, opts.minSilenceSec ?? 0.7)
  const padSec = Math.max(0, opts.padSec ?? 0.12)
  const thr = fromDb(thresholdDb)
  const minFrames = Math.max(1, Math.ceil((minSilenceSec * sr) / frame))
  const padFrames = Math.round((padSec * sr) / frame)

  const regions = []
  let i = 0
  while (i < rms.length) {
    if (rms[i] < thr) {
      let j = i
      while (j < rms.length && rms[j] < thr) j++
      if (j - i >= minFrames) {
        const a = (i + padFrames) * frame
        const b = Math.min(mono.length, (j - padFrames) * frame)
        if (b > a) regions.push({ startSample: a, endSample: b, startSec: a / sr, endSec: b / sr, enabled: true })
      }
      i = j
    } else i++
  }

  return {
    regions,
    thresholdDb,
    minSilenceSec,
    peaks: computePeaks(mono, 1600),
    durationSec: mono.length / sr,
    sampleRate: sr,
    length: mono.length,
  }
}

// Filtro passa-alta (remove ronco/grave/vento) via OfflineAudioContext.
async function applyHighpass(audioBuffer, freq = 85) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
  if (!OAC) return audioBuffer
  const oac = new OAC(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate)
  const src = oac.createBufferSource()
  src.buffer = audioBuffer
  const hp = oac.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = freq
  src.connect(hp)
  hp.connect(oac.destination)
  src.start()
  return await oac.startRendering()
}

function peakOf(channels) {
  let peak = 0
  for (const d of channels) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a }
  return peak
}

// Aplica os cortes ESCOLHIDOS (regions com enabled) + melhorias. Devolve canais
// + estatísticas. opts: { highpass, smooth, normalize, targetDb }.
export async function render(audioBuffer, regions, opts = {}) {
  let buf = audioBuffer
  if (opts.highpass) {
    try { buf = await applyHighpass(audioBuffer) } catch { buf = audioBuffer }
  }
  const sr = buf.sampleRate
  const numCh = buf.numberOfChannels
  const len = buf.length

  // Faixas a MANTER = tudo menos as regiões ativas (ordenadas).
  const cuts = regions.filter((r) => r.enabled).map((r) => [r.startSample, r.endSample]).sort((a, b) => a[0] - b[0])
  const keep = []
  let pos = 0
  for (const [a, b] of cuts) {
    if (a > pos) keep.push([pos, Math.min(a, len)])
    pos = Math.max(pos, b)
  }
  if (pos < len) keep.push([pos, len])
  const ranges = keep.length ? keep : [[0, len]]

  const outLen = ranges.reduce((n, [a, b]) => n + (b - a), 0)
  const fade = opts.smooth ? Math.min(Math.floor(sr * 0.006), Math.floor(outLen / 4)) : 0 // ~6ms
  const channels = []
  for (let c = 0; c < numCh; c++) {
    const src = buf.getChannelData(c)
    const dst = new Float32Array(outLen)
    let p = 0
    for (const [a, b] of ranges) {
      dst.set(src.subarray(a, b), p)
      // Suaviza as emendas: fade-in no começo e fade-out no fim de cada trecho.
      if (fade > 0) {
        const segLen = b - a
        const f = Math.min(fade, segLen >> 1)
        for (let k = 0; k < f; k++) { dst[p + k] *= k / f; dst[p + segLen - 1 - k] *= k / f }
      }
      p += b - a
    }
    channels.push(dst)
  }

  let clipped = false
  if (opts.normalize) {
    const peak = peakOf(channels)
    if (peak > 0) {
      const gain = Math.min(20, fromDb(opts.targetDb ?? -1) / peak)
      if (gain !== 1) for (const d of channels) for (let k = 0; k < d.length; k++) d[k] = d[k] * gain
    }
  }
  // Clamp final + detecção de clipping (pra avisar).
  for (const d of channels) for (let k = 0; k < d.length; k++) {
    if (d[k] > 1) { d[k] = 1; clipped = true } else if (d[k] < -1) { d[k] = -1; clipped = true }
  }

  return {
    channels,
    sampleRate: sr,
    originalSec: audioBuffer.length / audioBuffer.sampleRate,
    newSec: outLen / sr,
    removedSec: (len - outLen) / sr,
    cuts: cuts.length,
    clipped,
  }
}

// Avisos OBJETIVOS de qualidade (não julga se "soa bem" — isso é você ouvindo).
export function qualityWarnings(stats) {
  const w = []
  if (stats.clipped) w.push('clip')
  if (stats.originalSec > 0 && stats.removedSec / stats.originalSec > 0.6) w.push('aggressive')
  return w
}

export function encodeWav(channels, sampleRate) {
  const numCh = channels.length
  const len = channels[0]?.length || 0
  const blockAlign = numCh * 2
  const dataSize = len * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)) }
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true)
  writeStr(36, 'data'); view.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const x = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7fff, true)
      off += 2
    }
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export const fmtDuration = (sec) => {
  if (!isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
