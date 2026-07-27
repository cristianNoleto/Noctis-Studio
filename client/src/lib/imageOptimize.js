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

// Converte um dataURL (base64) em Blob binário — para subir a imagem como um
// arquivo separado no Drive (em vez de embutir base64 no scene.json).
export async function dataUrlToBlob(dataURL) {
  return (await fetch(dataURL)).blob()
}

// Converte um Blob (imagem baixada do Drive) de volta em dataURL para o Excalidraw.
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

function canvasToDataUrl(source, tw, th, quality) {
  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, tw, th)
  try {
    return canvas.toDataURL('image/webp', quality)
  } catch {
    return null
  }
}

// Reamostra um dataURL para caber em maxDim e recomprime em WebP. Devolve o
// novo dataURL + mimeType, ou null se não valer a pena (menor não ficou).
// Usa createImageBitmap e libera o bitmap na hora para não acumular memória —
// imagens grandes (7 MB+) chegam a estourar a RAM se ficarem decodificadas.
// `opts`: { maxDim, quality, minBytes } — os modelos usam compressão mais forte.
export async function optimizeDataUrl(dataURL, mimeType, opts = {}) {
  const maxDim = opts.maxDim || MAX_DIM
  const quality = opts.quality || QUALITY
  const minBytes = opts.minBytes != null ? opts.minBytes : MIN_BYTES
  // SVGs são vetoriais e leves — não reamostrar.
  if (mimeType === 'image/svg+xml') return null
  if (dataUrlBytes(dataURL) < minBytes) return null

  let blob
  try {
    blob = await (await fetch(dataURL)).blob()
  } catch {
    return null
  }

  let out = null
  try {
    const bmp = await createImageBitmap(blob)
    const { width: w, height: h } = bmp
    if (w && h) {
      const scale = Math.min(1, maxDim / Math.max(w, h))
      out = canvasToDataUrl(bmp, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), quality)
    }
    bmp.close?.() // libera a memória do bitmap imediatamente
  } catch {
    return null // decodificação falhou/estourou memória → mantém original
  }

  if (!out || !out.startsWith('data:image/webp')) return null
  // Só aceita se realmente ficou menor.
  if (dataUrlBytes(out) >= dataUrlBytes(dataURL)) return null
  return { dataURL: out, mimeType: 'image/webp' }
}
