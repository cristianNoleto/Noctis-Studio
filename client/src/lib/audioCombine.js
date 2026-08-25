// Combinador de áudios — junta vários arquivos num só, no navegador (Web Audio),
// com espaçamento configurável e opções (nivelar volume, suavizar junções,
// silêncio no início/fim). Reaproveita encodeWav/encodeMp3 da remoção de silêncio.

// Reamostra um AudioBuffer para (targetSR, targetCh) via OfflineAudioContext —
// isso também faz o up/down-mix de canais (mono↔estéreo) automaticamente.
async function resample(buffer, targetSR, targetCh) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const len = Math.max(1, Math.ceil(buffer.duration * targetSR))
  const oac = new OAC(targetCh, len, targetSR)
  const src = oac.createBufferSource()
  src.buffer = buffer
  src.connect(oac.destination)
  src.start()
  const rb = await oac.startRendering()
  const chs = []
  for (let c = 0; c < targetCh; c++) chs.push(rb.getChannelData(c))
  return chs
}

const fromDb = (db) => Math.pow(10, db / 20)

// buffers: AudioBuffer[] na ordem desejada.
// opts: { gapSec, normalize, smooth, padStartSec, padEndSec, targetDb }
export async function combineAudios(buffers, opts = {}) {
  const gapSec = Math.max(0, opts.gapSec ?? 0.5)
  const padStartSec = Math.max(0, opts.padStartSec ?? 0)
  const padEndSec = Math.max(0, opts.padEndSec ?? 0)
  const targetDb = opts.targetDb ?? -1

  const targetSR = Math.max(...buffers.map((b) => b.sampleRate))
  const targetCh = Math.min(2, Math.max(...buffers.map((b) => b.numberOfChannels)))

  const rendered = []
  for (const b of buffers) rendered.push(await resample(b, targetSR, targetCh))

  const gap = Math.round(gapSec * targetSR)
  const padStart = Math.round(padStartSec * targetSR)
  const padEnd = Math.round(padEndSec * targetSR)
  const fade = opts.smooth ? Math.min(Math.round(0.008 * targetSR), 2048) : 0 // ~8ms

  const totalLen = padStart + padEnd + rendered.reduce((s, r) => s + r[0].length, 0) + gap * Math.max(0, rendered.length - 1)
  const out = Array.from({ length: targetCh }, () => new Float32Array(totalLen))

  let pos = padStart
  for (const chs of rendered) {
    const len = chs[0].length
    // Nivelar volume: sobe/baixa cada faixa para o mesmo pico-alvo.
    let gain = 1
    if (opts.normalize) {
      let peak = 0
      for (let c = 0; c < targetCh; c++) { const d = chs[c] || chs[0]; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a } }
      if (peak > 0) gain = Math.min(20, fromDb(targetDb) / peak)
    }
    for (let c = 0; c < targetCh; c++) {
      const src = chs[c] || chs[0]
      const dst = out[c]
      for (let i = 0; i < len; i++) dst[pos + i] = src[i] * gain
      if (fade > 0) {
        const f = Math.min(fade, len >> 1)
        for (let k = 0; k < f; k++) { dst[pos + k] *= k / f; dst[pos + len - 1 - k] *= k / f }
      }
    }
    pos += len + gap
  }

  // Clamp final (evita clipping se o ganho estourou).
  for (const d of out) for (let i = 0; i < d.length; i++) { if (d[i] > 1) d[i] = 1; else if (d[i] < -1) d[i] = -1 }

  return { channels: out, sampleRate: targetSR, durationSec: totalLen / targetSR }
}
