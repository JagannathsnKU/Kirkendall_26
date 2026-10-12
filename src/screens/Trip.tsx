import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Bus, Footprints, MapPin, X, type LucideIcon } from 'lucide-react'
import { pointsFor } from '../data'
import { TRIP, summarize, tripImpact, type TripMode } from '../route'
import { go } from '../router'
import { discardTrip, finishTrip, resumeTrip, startTrip, useTrip, type GpsStatus } from '../tracker'
import SpecularButton from '../SpecularButton'

const MODES: { mode: TripMode; icon: LucideIcon; label: string }[] = [
  { mode: 'walk', icon: Footprints, label: 'Walk or bike' },
  { mode: 'bus', icon: Bus, label: 'Bus or train' },
]

const GPS_TEXT: Record<GpsStatus, string> = {
  off: '',
  waiting: 'Finding your location…',
  ok: 'GPS is tracking',
  weak: 'Weak GPS signal. Head somewhere more open.',
  denied: 'Location is blocked. Allow it for this site in your browser settings.',
  unavailable: 'Can’t get your location on this device.',
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`
}

export default function Trip() {
  const { trip, status } = useTrip()
  const live = trip && !trip.end ? trip : null
  const summary = useMemo(() => summarize(live?.points ?? []), [live])
  const [now, setNow] = useState(Date.now)

  useEffect(() => resumeTrip(), [])
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [live])

  const finish = () => {
    finishTrip()
    go('snap', { replace: true })
  }
  const cancel = () => {
    if (summary.miles < 0.05 || confirm('Cancel this trip? It won’t count.')) {
      discardTrip()
      go('home')
    }
  }

  if (!live) {
    return (
      <div className="snap-screen trip">
        <div className="bar-top">
          <button className="icon-btn" onClick={() => go('home')} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <h1 className="title-sm">How are you getting there?</h1>
        <p className="sub">
          GPS measures how far you go and checks that your speed fits. Longer trips earn more points. When you arrive, snap a photo to log it.
        </p>
        <div className="trip-modes">
          {MODES.map((m) => (
            <button key={m.mode} className="trip-mode" onClick={() => startTrip(m.mode)}>
              <span className="trip-mode-icon">
                <m.icon size={24} strokeWidth={1.8} />
              </span>
              <strong>{m.label}</strong>
              <span>Up to {TRIP.MAX_MILES[m.mode]} miles count</span>
            </button>
          ))}
        </div>
        <p className="trip-note">
          <AlertCircle size={16} /> Keep EcoU open with the screen on while you travel. Phones don’t let web apps track in the background.
        </p>
      </div>
    )
  }

  const mode = MODES.find((m) => m.mode === live.mode)!
  const points = pointsFor(tripImpact(live.mode, summary.miles))
  const problem = status === 'denied' || status === 'unavailable'

  return (
    <div className="snap-screen trip">
      <div className="bar-top">
        <button className="icon-btn" onClick={() => go('home')} aria-label="Back to home">
          <X size={22} />
        </button>
      </div>

      <section className="trip-live">
        <span className="trip-mode-icon">
          <mode.icon size={26} strokeWidth={1.8} />
        </span>
        <p className="trip-miles">
          {summary.miles.toFixed(2)}
          <span>miles</span>
        </p>
        <div className="trip-stats">
          <div>
            <strong>{clock(now - live.start)}</strong>
            <span>time</span>
          </div>
          <div>
            <strong>{summary.avgMph.toFixed(1)}</strong>
            <span>mph avg</span>
          </div>
          <div>
            <strong>+{points}</strong>
            <span>points</span>
          </div>
        </div>
        <p className={`trip-gps is-${status}`}>
          <MapPin size={15} /> {GPS_TEXT[status]}
        </p>
      </section>

      <p className="trip-note">
        <AlertCircle size={16} />
        {summary.miles < TRIP.MIN_MILES
          ? `Travel at least ${TRIP.MIN_MILES} miles for it to count. Keep EcoU open with the screen on.`
          : `Finish when you arrive, then snap within ${TRIP.SNAP_WITHIN_MIN} minutes.`}
      </p>

      <div className="snap-foot trip-foot">
        <SpecularButton className="btn-block" onClick={finish} disabled={problem}>
          Finish & snap
        </SpecularButton>
        <button className="btn btn-soft btn-block" onClick={cancel}>
          Cancel trip
        </button>
      </div>
    </div>
  )
}
