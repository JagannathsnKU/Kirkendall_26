/**
 * A captured proof: a photo or a short video. Videos are checked through a few
 * still frames, so the clip itself only leaves the phone when it's shared.
 */
export interface Photo {
  kind: 'photo' | 'video'
  /** Image data URL: the photo, or a still from the video. */
  preview: string
  /** Base64 JPEGs sent to the AI check. One for a photo, several for a video. */
  frames: string[]
  thumb: string
  hash: string
  source: 'camera' | 'upload'
  video?: Blob
}

export const MAX_RECORD_SECONDS = 10
export const MAX_VIDEO_SECONDS = 30
const MAX_VIDEO_BYTES = 60 * 1024 * 1024
const FRAMES = 4

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

const base64 = (dataUrl: string) => dataUrl.split(',')[1]

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

export function capture(src: Source, source: Photo['source'] = 'camera'): Photo {
  return {
    kind: 'photo',
    preview: render(src, 1080, 0.82),
    frames: [base64(render(src, 768, 0.8))],
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

/** A still from a playing or paused video, sized for the AI check. */
export const still = (video: HTMLVideoElement) => render(video, 768, 0.78)

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/** Builds a video proof from stills taken across the clip, in order. */
export async function fromStills(stills: string[], video: Blob, source: Photo['source']): Promise<Photo> {
  const picked =
    stills.length <= FRAMES ? stills : Array.from({ length: FRAMES }, (_, i) => stills[Math.floor(((i + 0.5) * stills.length) / FRAMES)])
  const middle = await loadImage(stills[Math.floor(stills.length / 2)])
  return {
    kind: 'video',
    preview: middle.src,
    frames: picked.map(base64),
    thumb: render(middle, 240, 0.7, true),
    hash: dhash(middle),
    source,
    video,
  }
}

function once(el: HTMLVideoElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 10_000)
    el.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true })
    el.addEventListener('error', () => (clearTimeout(timer), reject(new Error('error'))), { once: true })
  })
}

export async function fromVideoFile(file: File): Promise<Photo> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error(`That video is too big. Keep it under ${MAX_VIDEO_SECONDS} seconds.`)
  const url = URL.createObjectURL(file)
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  try {
    await once(v, 'loadeddata')
    if (!isFinite(v.duration) || v.duration > MAX_VIDEO_SECONDS + 0.5) {
      throw new Error(`Keep videos under ${MAX_VIDEO_SECONDS} seconds.`)
    }
    const stills: string[] = []
    for (let i = 0; i < FRAMES; i++) {
      v.currentTime = (v.duration * (i + 0.5)) / FRAMES
      await once(v, 'seeked')
      stills.push(still(v))
    }
    return await fromStills(stills, file, 'upload')
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Keep')) throw e
    throw new Error('We couldn’t open that video. Try recording it in the app.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
