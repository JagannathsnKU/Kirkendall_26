/*
 * Reads the camera metadata (EXIF) that phones write into every photo they take,
 * and decides whether an uploaded photo is fresh, original, and from a camera.
 * Screenshots, downloaded images, and pictures forwarded through messaging apps
 * usually have this stripped, so they fail here before reaching the AI check.
 */

export interface PhotoMeta {
  make?: string
  model?: string
  software?: string
  taken?: Date
}

const MAX_FILE = 25 * 1024 * 1024
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const CLOCK_SKEW_MS = 60 * 60 * 1000
const EDITORS =
  /photoshop|lightroom|gimp|snapseed|picsart|canva|pixelmator|affinity|facetune|vsco|photoroom|remini|meitu|airbrush|lensa|faceapp|polarr|darkroom|afterlight|photo editor|firefly|midjourney|dall|stable diffusion/i

const TAG = {
  make: 0x010f,
  model: 0x0110,
  software: 0x0131,
  dateTime: 0x0132,
  exifIfd: 0x8769,
  dateTimeOriginal: 0x9003,
  dateTimeDigitized: 0x9004,
  offsetTimeOriginal: 0x9011,
}

/** Finds the TIFF block that follows the "Exif\0\0" marker (JPEG APP1 and HEIC both use it). */
function findTiff(bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length - 10; i++) {
    if (bytes[i] === 0x45 && bytes[i + 1] === 0x78 && bytes[i + 2] === 0x69 && bytes[i + 3] === 0x66 && bytes[i + 4] === 0 && bytes[i + 5] === 0) {
      const a = bytes[i + 6]
      const b = bytes[i + 7]
      if ((a === 0x49 && b === 0x49) || (a === 0x4d && b === 0x4d)) return i + 6
    }
  }
  return -1
}

function readIfd(view: DataView, tiff: number, offset: number, le: boolean): Map<number, string | number> {
  const out = new Map<number, string | number>()
  const count = view.getUint16(tiff + offset, le)
  for (let n = 0; n < count; n++) {
    const entry = tiff + offset + 2 + n * 12
    const tag = view.getUint16(entry, le)
    const type = view.getUint16(entry + 2, le)
    const len = view.getUint32(entry + 4, le)
    if (type === 2) {
      const start = len <= 4 ? entry + 8 : tiff + view.getUint32(entry + 8, le)
      let s = ''
      for (let k = 0; k < len - 1 && start + k < view.byteLength; k++) s += String.fromCharCode(view.getUint8(start + k))
      out.set(tag, s.replace(/\0+$/, '').trim())
    } else if (type === 4) {
      out.set(tag, view.getUint32(entry + 8, le))
    }
  }
  return out
}

/** EXIF dates look like "2026:10:04 13:05:22", in the camera's local time. */
function parseDate(value: unknown, offset: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  if (!m) return undefined
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`
  const tz = typeof offset === 'string' && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : ''
  const d = new Date(iso + tz)
  return isNaN(d.getTime()) ? undefined : d
}

export async function readMeta(file: File): Promise<PhotoMeta | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const tiff = findTiff(bytes)
  if (tiff < 0) return null
  try {
    const view = new DataView(bytes.buffer)
    const le = view.getUint8(tiff) === 0x49
    const ifd0 = readIfd(view, tiff, view.getUint32(tiff + 4, le), le)
    const exifAt = ifd0.get(TAG.exifIfd)
    const exif = typeof exifAt === 'number' ? readIfd(view, tiff, exifAt, le) : new Map()
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
    return {
      make: str(ifd0.get(TAG.make)),
      model: str(ifd0.get(TAG.model)),
      software: str(ifd0.get(TAG.software)),
      taken: parseDate(exif.get(TAG.dateTimeOriginal) ?? exif.get(TAG.dateTimeDigitized), exif.get(TAG.offsetTimeOriginal)),
    }
  } catch {
    return null
  }
}

/** Returns a message explaining why the upload can't be used, or null if it passes. */
export async function checkUpload(file: File): Promise<string | null> {
  if (file.size > MAX_FILE) return 'That photo is too large.'
  const meta = await readMeta(file)
  if (!meta || !(meta.make || meta.model)) {
    return 'This photo has no camera details, like screenshots and saved images. Pick one you took or snap it live.'
  }
  if (meta.software && EDITORS.test(meta.software)) return 'Edited photos can’t be used. Pick the original.'
  if (!meta.taken) return 'We can’t tell when this photo was taken. Snap it live instead.'
  const age = Date.now() - meta.taken.getTime()
  if (age < -CLOCK_SKEW_MS) return 'This photo’s date looks off. Snap it live instead.'
  if (age > MAX_AGE_MS) return 'Only photos taken in the last 24 hours count.'
  return null
}

/** Reads the recording time from the "mvhd" box that MP4 and MOV files carry, near the start or the end. */
async function videoDate(file: File): Promise<Date | null> {
  const span = 4 * 1024 * 1024
  const parts = file.size > span ? [file.slice(0, span), file.slice(file.size - span)] : [file]
  for (const part of parts) {
    const bytes = new Uint8Array(await part.arrayBuffer())
    for (let i = 4; i < bytes.length - 16; i++) {
      if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) continue
      const view = new DataView(bytes.buffer, bytes.byteOffset + i + 4)
      const seconds = view.getUint8(0) === 1 ? Number(view.getBigUint64(4)) : view.getUint32(4)
      // MP4 times count from 1904-01-01 UTC.
      return seconds ? new Date((seconds - 2_082_844_800) * 1000) : null
    }
  }
  return null
}

/** Same freshness rule as photos: recorded in the last 24 hours. */
export async function checkVideo(file: File): Promise<string | null> {
  const taken = await videoDate(file)
  if (!taken) return 'We can’t tell when this video was taken. Record it in the app instead.'
  const age = Date.now() - taken.getTime()
  if (age < -CLOCK_SKEW_MS) return 'This video’s date looks off. Record it in the app instead.'
  if (age > MAX_AGE_MS) return 'Only videos recorded in the last 24 hours count.'
  return null
}
