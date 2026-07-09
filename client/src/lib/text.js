// Utilidades de texto/tempo de narração — cálculo puramente matemático
// (150 WPM base, ±15%), sem depender de áudio real.

export const BASE_WPM = 150

export function countWords(text) {
  return (text.trim().match(/\S+/g) || []).length
}

export function countParagraphs(text) {
  return text.split(/\n\s*\n|\n/).filter((p) => p.trim()).length
}

export function narrationSeconds(text, speed = 'normal') {
  const words = countWords(text)
  const base = (words / BASE_WPM) * 60
  if (speed === 'slow') return base * 1.15
  if (speed === 'fast') return base * 0.85
  return base
}

export function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(sec).padStart(2, '0')}s`
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

function srtTimestamp(seconds) {
  const ms = Math.round((seconds % 1) * 1000)
  const s = Math.floor(seconds)
  const h = String(Math.floor(s / 3600)).padStart(2, '0')
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const sec = String(s % 60).padStart(2, '0')
  return `${h}:${m}:${sec},${String(ms).padStart(3, '0')}`
}

// Gera um .srt de referência dividindo o texto em blocos de legenda com
// timestamps proporcionais ao tempo de leitura (WPM). O usuário ajusta o
// resultado no editor de vídeo — é uma base, não sincronização real.
export function generateSrt(text, { wordsPerBlock = 12, wpm = BASE_WPM } = {}) {
  const words = text.trim().match(/\S+/g) || []
  if (words.length === 0) return ''
  const secondsPerWord = 60 / wpm
  const blocks = []
  for (let i = 0; i < words.length; i += wordsPerBlock) {
    blocks.push(words.slice(i, i + wordsPerBlock).join(' '))
  }
  let cursor = 0
  return blocks
    .map((block, i) => {
      const blockWords = countWords(block)
      const duration = blockWords * secondsPerWord
      const start = cursor
      const end = cursor + duration
      cursor = end
      return `${i + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(end)}\n${block}\n`
    })
    .join('\n')
}

// Divide um roteiro em partes de até `limit` caracteres sem cortar palavras.
export function splitTextByLimit(text, limit = 500) {
  const parts = []
  let rest = text.trim()
  while (rest.length > limit) {
    let cut = rest.lastIndexOf(' ', limit)
    if (cut <= 0) cut = limit
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

// Índice de legibilidade Flesch adaptado para português (Martins et al.).
export function fleschPt(text) {
  const words = countWords(text)
  const sentences = Math.max(1, (text.match(/[.!?…]+/g) || []).length)
  const syllables = estimateSyllables(text)
  if (words === 0) return 0
  const score = 248.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)
  return Math.max(0, Math.min(100, Math.round(score)))
}

function estimateSyllables(text) {
  const matches = text.toLowerCase().match(/[aeiouáéíóúâêôãõà]+/g) || []
  return matches.length
}

export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
