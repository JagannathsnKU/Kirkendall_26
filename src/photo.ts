export interface Photo {
  preview: string
  upload: string
  thumb: string
  hash: string
  source: 'camera' | 'upload'
}

type Source = HTMLVideoElement | HTMLImageElement

const dims = (s: Source) =>
  s instanceof HTMLVideoElement ? { w: s.videoWidth, h: s.videoHeight } : { w: s.naturalWidth, h: s.naturalHeight }

function render(src: Source, maxSide: number, quality: number, square = false) {
  const { w, h } = dims(src)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  if (square) {
    const s = Math.min(w, h)
    canvas.width = canvas.height = maxSide
    ctx.drawImage(src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, maxSide, maxSide)
  } else {
    const k = Math.min(1, maxSide / Math.max(w, h))
    canvas.width = Math.round(w * k)
    canvas.height = Math.round(h * k)
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  }
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * 64-bit difference hash: near-identical photos produce near-identical hashes.
 * Returns '' for flat, low-detail images (a dark room, a blank wall) whose hashes
 * would collide with each other; the server-side AI check covers those.
 */
function dhash(src: Source) {
  const { w, h } = dims(src)
  const canvas = document.createElement('canvas')
  canvas.width = 9
  canvas.height = 8
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, w, h, 0, 0, 9, 8)
  const px = ctx.getImageData(0, 0, 9, 8).data
  const gray = (i: number) => px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114
  const values = Array.from({ length: 72 }, (_, i) => gray(i))
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const spread = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
  if (spread < 8) return ''
  let hex = ''
  for (let y = 0; y < 8; y++) {
    let byte = 0
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (gray(y * 9 + x) > gray(y * 9 + x + 1) ? 1 : 0)
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

export function hammingDistance(a: string, b: string) {
  let d = 0
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16)
    while (x) {
      d += x & 1
      x >>= 1
    }
  }
  return d
}

export function capture(src: Source, source: Photo['source'] = 'camera'): Photo {
  return {
    preview: render(src, 1080, 0.82),
    upload: render(src, 768, 0.8).split(',')[1],
    thumb: render(src, 240, 0.7, true),
    hash: dhash(src),
    source,
  }
}

export function fromFile(file: File): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(capture(img, 'upload'))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('We couldn’t open that photo. Try a JPEG, or snap it live.'))
    }
    img.src = url
  })
}
