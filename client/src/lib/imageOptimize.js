// Reduz imagens coladas/soltas no Excalidraw ANTES de salvar. Projetos com muitas
// imagens em resolução original chegam a 600 MB–2 GB; reamostrar para um limite
// de dimensão e recomprimir (WebP) corta o tamanho drasticamente sem perda visível
// no canvas. Mantém o MESMO fileId, então os elementos de imagem continuam válidos.

const MAX_DIM = 1800 // maior lado, em px
const QUALITY = 0.82 // qualidade WebP
const MIN_BYTES = 180 * 1024 // não mexe em imagens já pequenas (< ~180 KB)

// Tamanho aproximado em bytes de um dataURL base64.
export function dataUrlBytes(dataURL) {
  const i = dataURL.indexOf(',')
  if (i < 0) return 0
  const b64 = dataURL.slice(i + 1)
  return Math.floor((b64.length * 3) / 4)
}

function loadImage(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataURL
  })
}

// Reamostra um dataURL para caber em MAX_DIM e recomprime em WebP. Devolve o
// novo dataURL + mimeType, ou null se não valer a pena (menor não ficou).
export async function optimizeDataUrl(dataURL, mimeType) {
  // SVGs são vetoriais e leves — não reamostrar.
  if (mimeType === 'image/svg+xml') return null
  if (dataUrlBytes(dataURL) < MIN_BYTES) return null
  let img
  try {
    img = await loadImage(dataURL)
  } catch {
    return null
  }
  const { width: w, height: h } = img
  if (!w || !h) return null
  const scale = Math.min(1, MAX_DIM / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, tw, th)
  let out
  try {
    out = canvas.toDataURL('image/webp', QUALITY)
  } catch {
    return null
  }
  if (!out || !out.startsWith('data:image/webp')) return null
  // Só aceita se realmente ficou menor.
  if (dataUrlBytes(out) >= dataUrlBytes(dataURL)) return null
  return { dataURL: out, mimeType: 'image/webp' }
}
