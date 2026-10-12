import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CameraOff, Image as ImageIcon, X } from 'lucide-react'
import { ANTI_CHEAT } from '../config'
import { checkUpload, checkVideo } from '../exif'
import { MAX_RECORD_SECONDS, capture, fromFile, fromStills, fromVideoFile, still, type Photo } from '../photo'

type CamState = 'starting' | 'live' | 'denied' | 'unavailable'

const HOLD_MS = 280
const RECORD_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
const canRecord = typeof MediaRecorder !== 'undefined'
const isVideo = (file: File) => file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name)

export default function Camera({ onCapture, onClose }: { onCapture: (p: Photo) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stills = useRef<string[]>([])
  const holdTimer = useRef(0)
  const tick = useRef(0)
  const [state, setState] = useState<CamState>('starting')
  const [flash, setFlash] = useState(false)
  const [reading, setReading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [seconds, setSeconds] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream.current = s
        if (video.current) video.current.srcObject = s
        setState('live')
      })
      .catch((e: DOMException) => setState(e.name === 'NotAllowedError' ? 'denied' : 'unavailable'))
    return () => {
      cancelled = true
      clearTimeout(holdTimer.current)
      clearInterval(tick.current)
      if (recorder.current) {
        recorder.current.onstop = null
        recorder.current.stop()
      }
      stream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const stop = () => stream.current?.getTracks().forEach((t) => t.stop())

  const shoot = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    setFlash(true)
    const photo = capture(v)
    stop()
    setTimeout(() => onCapture(photo), 120)
  }

  const finishRecording = () => {
    const rec = recorder.current
    recorder.current = null
    clearInterval(tick.current)
    if (rec && rec.state !== 'inactive') {
      if (video.current) stills.current.push(still(video.current))
      rec.stop()
    }
  }

  const startRecording = () => {
    const v = video.current
    if (!stream.current || !v?.videoWidth || !canRecord) return false
    const mimeType = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream.current, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000 } : undefined)
    } catch {
      return false
    }
    const chunks: Blob[] = []
    stills.current = [still(v)]
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = async () => {
      const clip = new Blob(chunks, { type: rec.mimeType || mimeType || 'video/mp4' })
      stop()
      onCapture(await fromStills(stills.current, clip, 'camera'))
    }
    rec.start(250)
    recorder.current = rec
    const startedAt = Date.now()
    setSeconds(0)
    tick.current = window.setInterval(() => {
      const t = (Date.now() - startedAt) / 1000
      setSeconds(t)
      stills.current.push(still(v))
      if (t >= MAX_RECORD_SECONDS) finishRecording()
    }, 500)
    return true
  }

  const press = () => {
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = 0
      startRecording()
    }, HOLD_MS)
  }

  const release = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
      holdTimer.current = 0
      shoot()
    } else if (recorder.current) finishRecording()
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setNotice(null)
    setReading(true)
    try {
      const clip = isVideo(file)
      const problem = ANTI_CHEAT ? await (clip ? checkVideo(file) : checkUpload(file)) : null
      if (problem) return setNotice(problem)
      const proof = clip ? await fromVideoFile(file) : await fromFile(file)
      stop()
      onCapture(proof)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'We couldn’t open that file.')
    } finally {
      setReading(false)
    }
  }

  const picker = (
    <input
      type="file"
      accept="image/*,video/*"
      hidden
      onChange={(e) => {
        upload(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )

  const recording = seconds !== null

  return (
    <div className="camera">
      <video ref={video} className="camera-video" autoPlay playsInline muted />
      {flash && <div className="camera-flash" />}

      {!recording && (
        <button className="icon-btn camera-close" onClick={onClose} aria-label="Close">
          <X size={22} />
        </button>
      )}

      {recording && (
        <div className="camera-timer" aria-live="polite">
          <span /> 0:{String(Math.min(MAX_RECORD_SECONDS, Math.floor(seconds))).padStart(2, '0')} / 0:{MAX_RECORD_SECONDS}
        </div>
      )}

      {notice && (
        <div className="camera-notice" role="alert">
          <AlertCircle size={18} />
          <span>{notice}</span>
        </div>
      )}

      {state === 'live' && (
        <>
          <button
            className={`shutter ${recording ? 'is-recording' : ''}`}
            style={recording ? { ['--progress' as string]: `${(seconds / MAX_RECORD_SECONDS) * 360}deg` } : undefined}
            onPointerDown={press}
            onPointerUp={release}
            onPointerCancel={() => recorder.current && finishRecording()}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && shoot()}
            aria-label={canRecord ? 'Tap for a photo, hold for a video' : 'Take photo'}
          />
          {!recording && canRecord && <p className="camera-hint">Tap for photo · hold for video</p>}
          {!recording && (
            <label className="camera-gallery" aria-label="Upload a photo or video">
              {reading ? <span className="spinner" /> : <ImageIcon size={22} />}
              {picker}
            </label>
          )}
        </>
      )}

      {(state === 'denied' || state === 'unavailable') && (
        <div className="camera-msg">
          <CameraOff size={34} />
          <strong>{state === 'denied' ? 'Camera is off' : 'Camera not available'}</strong>
          <span>
            {state === 'denied'
              ? 'Enable it in your browser settings, or upload a photo or video you just took.'
              : window.isSecureContext
                ? 'Upload a photo or video you just took instead.'
                : 'The camera needs a secure (https) connection. Upload a photo or video instead.'}
          </span>
          <label className="btn btn-soft btn-sm">
            {reading ? <span className="spinner" /> : <ImageIcon size={16} />} Upload
            {picker}
          </label>
        </div>
      )}
    </div>
  )
}
