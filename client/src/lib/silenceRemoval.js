// Remoção de silêncio 100% no navegador (Web Audio API). Sem servidor, sem custo.
// Fluxo: decodifica o áudio → detecta trechos silenciosos (por RMS em janelas) →
// remove os longos (deixando uma folga pra não picar) → normaliza (opcional) →
// exporta WAV para download. Tudo determinístico (DSP), rápido e reversível.

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

// Mixdown mono (só para DETECTAR silêncio; o corte é aplicado a todos os canais).
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

// RMS por janela (~20ms). Devolve o array de RMS e o tamanho da janela em amostras.
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

// Limiar AUTOMÁTICO: piso de ruído (percentil 10 das janelas) + 8 dB de margem,
// nunca acima de -25 dBFS. Assim se adapta a áudios com mais ou menos chiado.
function autoThresholdDb(rms) {
  const dbs = Array.from(rms, toDb).sort((a, b) => a - b)
  const floor = dbs[Math.floor(dbs.length * 0.1)] ?? -60
  return Math.min(-25, floor + 8)
}

// Pico absoluto de todos os canais (para a normalização).
function peakOf(channels) {
  let peak = 0
  for (const d of channels) for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a }
  return peak
}

// opts: { mode: 'auto'|'manual', thresholdDb, minSilenceSec, padSec, normalize, targetDb }
export function removeSilence(audioBuffer, opts = {}) {
  const sr = audioBuffer.sampleRate
  const numCh = audioBuffer.numberOfChannels
  const mono = toMono(audioBuffer)
  const { rms, frame } = frameRms(mono, sr, 20)

  const thresholdDb = opts.mode === 'auto' ? autoThresholdDb(rms) : opts.thresholdDb ?? -40
  const minSilenceSec = opts.mode === 'auto' ? 0.5 : Math.max(0.05, opts.minSilenceSec ?? 0.7)
  const padSec = Math.max(0, opts.padSec ?? 0.12)
  const thr = fromDb(thresholdDb)

  const minFrames = Math.max(1, Math.ceil((minSilenceSec * sr) / frame))
  const padFrames = Math.round((padSec * sr) / frame)

  // Marca quais janelas MANTER (1). Remove o miolo de cada silêncio longo,
  // preservando `padFrames` de cada lado (respiro natural, sem clipar a fala).
  const keep = new Uint8Array(rms.length).fill(1)
  let cuts = 0
  let i = 0
  while (i < rms.length) {
    if (rms[i] < thr) {
      let j = i
      while (j < rms.length && rms[j] < thr) j++
      if (j - i >= minFrames) {
        for (let k = i + padFrames; k < j - padFrames; k++) keep[k] = 0
        cuts++
      }
      i = j
    } else i++
  }

  // Junta as janelas mantidas em faixas contíguas (em amostras).
  const ranges = []
  let s = -1
  for (let f = 0; f < keep.length; f++) {
    if (keep[f] && s < 0) s = f
    else if (!keep[f] && s >= 0) { ranges.push([s * frame, Math.min(mono.length, f * frame)]); s = -1 }
  }
  if (s >= 0) ranges.push([s * frame, mono.length])

  const outLen = ranges.reduce((n, [a, b]) => n + (b - a), 0) || mono.length
  const channels = []
  for (let c = 0; c < numCh; c++) {
    const src = audioBuffer.getChannelData(c)
    const dst = new Float32Array(outLen)
    let pos = 0
    for (const [a, b] of ranges) { dst.set(src.subarray(a, b), pos); pos += b - a }
    channels.push(dst)
  }

  // Normalização de pico (opcional): sobe o volume até o alvo (ex.: -1 dBFS).
  if (opts.normalize) {
    const peak = peakOf(channels)
    if (peak > 0) {
      const gain = Math.min(20, fromDb(opts.targetDb ?? -1) / peak) // teto de +26 dB
      if (gain !== 1) for (const d of channels) for (let k = 0; k < d.length; k++) d[k] = Math.max(-1, Math.min(1, d[k] * gain))
    }
  }

  return {
    channels,
    sampleRate: sr,
    originalSec: audioBuffer.length / sr,
    newSec: outLen / sr,
    removedSec: (audioBuffer.length - outLen) / sr,
    cuts,
    thresholdDb,
    minSilenceSec,
  }
}

// Codifica canais Float32 em WAV PCM 16-bit (para download).
export function encodeWav(channels, sampleRate) {
  const numCh = channels.length
  const len = channels[0]?.length || 0
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const dataSize = len * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)) }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numCh, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

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
