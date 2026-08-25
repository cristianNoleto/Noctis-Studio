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
// opts: { gaps (s por par, n-1), crossfadeSec, normalize, smooth, padStartSec, padEndSec, targetDb }
export async function combineAudios(buffers, opts = {}) {
  const padStartSec = Math.max(0, opts.padStartSec ?? 0)
  const padEndSec = Math.max(0, opts.padEndSec ?? 0)
  const targetDb = opts.targetDb ?? -1
  const n = buffers.length

  const targetSR = Math.max(...buffers.map((b) => b.sampleRate))
  const targetCh = Math.min(2, Math.max(...buffers.map((b) => b.numberOfChannels)))

  const rendered = []
  for (const b of buffers) rendered.push(await resample(b, targetSR, targetCh))
  const lens = rendered.map((r) => r[0].length)

  const cf = Math.round(Math.max(0, opts.crossfadeSec ?? 0) * targetSR) // >0 = faixas se sobrepõem e mesclam
  const padStart = Math.round(padStartSec * targetSR)
  const padEnd = Math.round(padEndSec * targetSR)
  const smoothFade = opts.smooth ? Math.min(Math.round(0.008 * targetSR), 2048) : 0 // ~8ms
  const gapSamples = (i) => (cf > 0 ? 0 : Math.round(Math.max(0, opts.gaps?.[i] ?? 0) * targetSR))

  // Posições de início de cada faixa (com crossfade elas se sobrepõem).
  const starts = new Array(n)
  let cursor = padStart
  for (let i = 0; i < n; i++) {
    starts[i] = cursor
    if (i < n - 1) cursor += cf > 0 ? Math.max(1, lens[i] - cf) : lens[i] + gapSamples(i)
    else cursor += lens[i]
  }
  const totalLen = cursor + padEnd
  const out = Array.from({ length: targetCh }, () => new Float32Array(totalLen))

  for (let i = 0; i < n; i++) {
    const chs = rendered[i]
    const len = lens[i]
    // Nivelar volume: cada faixa ao mesmo pico-alvo.
    let gain = 1
    if (opts.normalize) {
      let peak = 0
      for (let c = 0; c < targetCh; c++) { const d = chs[c] || chs[0]; for (let k = 0; k < d.length; k++) { const a = Math.abs(d[k]); if (a > peak) peak = a } }
      if (peak > 0) gain = Math.min(20, fromDb(targetDb) / peak)
    }
    const start = starts[i]
    for (let c = 0; c < targetCh; c++) {
      const src = chs[c] || chs[0]
      const dst = out[c]
      for (let k = 0; k < len; k++) {
        let g = gain
        if (cf > 0) {
          // Crossfade de potência constante (sen/cos) nas bordas que se sobrepõem.
          if (i > 0 && k < cf) g *= Math.sin(((k + 0.5) / cf) * (Math.PI / 2))
          if (i < n - 1 && k >= len - cf) g *= Math.cos(((k - (len - cf) + 0.5) / cf) * (Math.PI / 2))
        } else if (smoothFade > 0) {
          const f = Math.min(smoothFade, len >> 1)
          if (k < f) g *= k / f
          else if (k >= len - f) g *= (len - 1 - k) / f
        }
        dst[start + k] += src[k] * g // += para somar as sobreposições do crossfade
      }
    }
  }

  for (const d of out) for (let k = 0; k < d.length; k++) { if (d[k] > 1) d[k] = 1; else if (d[k] < -1) d[k] = -1 }

  return { channels: out, sampleRate: targetSR, durationSec: totalLen / targetSR }
}
