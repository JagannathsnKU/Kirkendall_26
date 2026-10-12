import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CameraOff, Image as ImageIcon, X } from 'lucide-react'
import { ANTI_CHEAT } from '../config'
import { checkUpload } from '../exif'
import { capture, fromFile, type Photo } from '../photo'

type CamState = 'starting' | 'live' | 'denied' | 'unavailable'

export default function Camera({ onCapture, onClose }: { onCapture: (p: Photo) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [state, setState] = useState<CamState>('starting')
  const [flash, setFlash] = useState(false)
  const [reading, setReading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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

  const upload = async (file: File | undefined) => {
    if (!file) return
    setNotice(null)
    setReading(true)
    try {
      const problem = ANTI_CHEAT ? await checkUpload(file) : null
      if (problem) return setNotice(problem)
      const photo = await fromFile(file)
      stop()
      onCapture(photo)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'We couldn’t open that photo.')
    } finally {
      setReading(false)
    }
  }

  const picker = (
    <input
      type="file"
      accept="image/jpeg,image/heic,image/heif,image/*"
      hidden
      onChange={(e) => {
        upload(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )

  return (
    <div className="camera">
      <video ref={video} className="camera-video" autoPlay playsInline muted />
      {flash && <div className="camera-flash" />}

      <button className="icon-btn camera-close" onClick={onClose} aria-label="Close">
        <X size={22} />
      </button>

      {notice && (
        <div className="camera-notice" role="alert">
          <AlertCircle size={18} />
          <span>{notice}</span>
        </div>
      )}

      {state === 'live' && (
        <>
          <button className="shutter" onClick={shoot} aria-label="Take photo" />
          <label className="camera-gallery" aria-label="Upload a photo">
            {reading ? <span className="spinner" /> : <ImageIcon size={22} />}
            {picker}
          </label>
        </>
      )}

      {(state === 'denied' || state === 'unavailable') && (
        <div className="camera-msg">
          <CameraOff size={34} />
          <strong>{state === 'denied' ? 'Camera is off' : 'Camera not available'}</strong>
          <span>
            {state === 'denied'
              ? 'Enable it in your browser settings, or upload a photo you just took.'
              : window.isSecureContext
                ? 'Upload a photo you just took instead.'
                : 'The camera needs a secure (https) connection. Upload a photo instead.'}
          </span>
          <label className="btn btn-soft btn-sm">
            {reading ? <span className="spinner" /> : <ImageIcon size={16} />} Upload a photo
            {picker}
          </label>
        </div>
      )}
    </div>
  )
}
