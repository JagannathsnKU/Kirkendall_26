import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, MapPin, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react'
import { atDailyLimit, cooldownLeft, sharePost, submitSnap } from '../api'
import { ACTIONS, OTHER, pointsFor, universityById, waitText } from '../data'
import { UPVOTE_BONUS, UPVOTE_STEP } from '../model'
import type { Photo } from '../photo'
import { milesText, summarize, tripImpact } from '../route'
import { go } from '../router'
import { useStore } from '../store'
import { discardTrip, finishTrip, pendingTrip, useTrip } from '../tracker'
import { Glyph } from '../glyph'
import Camera from './Camera'
import SpecularButton from '../SpecularButton'

export default function Snap() {
  const { session, refresh, setResult } = useStore()
  const { trip } = useTrip()
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [actionId, setActionId] = useState<string | null>(() => pendingTrip(trip)?.mode ?? null)
  const [note, setNote] = useState('')
  const [share, setShare] = useState(false)
  const [checking, setChecking] = useState(false)
  const [sharing, setSharing] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const uni = universityById(session!.user.universityId)

  const clipUrl = useMemo(() => (photo?.video ? URL.createObjectURL(photo.video) : null), [photo])
  useEffect(() => () => void (clipUrl && URL.revokeObjectURL(clipUrl)), [clipUrl])

  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const done = pendingTrip(trip, now)
  const live = trip && !trip.end ? trip : null
  const { miles: tripMiles, minutes } = useMemo(() => summarize(trip?.points ?? []), [trip])
  const tripMinutes = Math.round(minutes)
  const tripFor = done && actionId === done.mode ? done : null

  useEffect(() => {
    if (trip?.end && !done) discardTrip()
  }, [trip, done])

  /** Why an action can't be picked right now, or null if it can. */
  const availability = (id: string) => {
    if (atDailyLimit(session!.snaps, id)) return 'Done today'
    const wait = cooldownLeft(session!.snaps, id, now)
    return wait > 0 ? `In ${waitText(wait)}` : null
  }

  const isOther = actionId === OTHER.id
  const ready = !!actionId && !availability(actionId) && (!isOther || note.trim().length >= 3)
  const busy = checking || sharing !== null

  const close = () => go('home')
  const retake = () => {
    setPhoto(null)
    setProblem(null)
  }

  const submit = async () => {
    if (!photo || !actionId || !ready || busy) return
    setChecking(true)
    setProblem(null)
    const outcome = await submitSnap(actionId, photo, isOther ? note : undefined, tripFor ? { mode: tripFor.mode, points: tripFor.points } : undefined)
    setChecking(false)
    if (!outcome.ok) {
      setProblem(outcome.message)
      return
    }
    if (tripFor) discardTrip()
    let spotlight: 'shared' | 'failed' | undefined
    if (share) {
      setSharing(0)
      try {
        await sharePost(session!.user.id, outcome.result.snapId, photo, (pct) => setSharing(Math.round(pct)))
        spotlight = 'shared'
      } catch (e) {
        console.error(e)
        spotlight = 'failed'
      }
    }
    await refresh()
    setResult({ ...outcome.result, spotlight })
    go('result', { replace: true })
  }

  if (!photo) return <Camera onCapture={setPhoto} onClose={close} />

  return (
    <div className="snap-screen">
      <div className="bar-top">
        <button className="icon-btn" onClick={close} aria-label="Close">
          <X size={22} />
        </button>
        <button className="icon-btn" onClick={retake} aria-label="Retake" disabled={busy}>
          <RotateCcw size={20} />
        </button>
      </div>

      <div className={`preview-wrap ${busy ? 'is-checking' : ''}`}>
        {clipUrl ? (
          <video className="preview" src={clipUrl} poster={photo.preview} autoPlay loop muted playsInline />
        ) : (
          <img className="preview" src={photo.preview} alt="Your snapshot" />
        )}
        {busy && (
          <div className="checking">
            {sharing !== null ? (
              <>
                <Sparkles size={20} /> Sharing… {sharing}%
              </>
            ) : (
              <>
                <ShieldCheck size={22} /> Checking your {photo.kind}…
              </>
            )}
          </div>
        )}
      </div>

      {problem ? (
        <div className="problem">
          <AlertCircle size={22} />
          <p>{problem}</p>
          <SpecularButton size="sm" onClick={retake}>
            Retake
          </SpecularButton>
        </div>
      ) : (
        <>
          {(done || live) && (
            <div className="snap-trip">
              <MapPin size={16} />
              <span>
                {live ? `Trip in progress · ${milesText(tripMiles)}` : `GPS trip · ${milesText(tripMiles)} in ${tripMinutes} min`}
                {done && !tripFor && ` · pick ${ACTIONS.find((a) => a.id === done.mode)?.label} to use it`}
              </span>
              {live ? (
                <SpecularButton size="sm"
                  onClick={() => {
                    finishTrip()
                    setActionId(live.mode)
                  }}
                  disabled={busy}
                >
                  Finish
                </SpecularButton>
              ) : (
                <button className="icon-btn sm" onClick={discardTrip} aria-label="Don’t use this trip" disabled={busy}>
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          <h1 className="title-sm">What did you do?</h1>
          <div className="actions">
            {[...ACTIONS, OTHER].map((a) => {
              const status = availability(a.id)
              return (
                <button
                  key={a.id}
                  className={`action ${a.id === OTHER.id ? 'action-other' : ''} ${actionId === a.id ? 'is-on' : ''}`}
                  onClick={() => setActionId(a.id)}
                  aria-pressed={actionId === a.id}
                  disabled={!!status || busy}
                >
                  <span className="action-icon">
                    <Glyph emoji={a.emoji} size={22} />
                  </span>
                  <span className="action-label">{a.label}</span>
                  <span className="action-pts">{status ?? `+${done && a.id === done.mode ? pointsFor(tripImpact(done.mode, tripMiles)) : a.points}`}</span>
                </button>
              )
            })}
          </div>

          {(actionId === 'walk' || actionId === 'bus') && !tripFor && !live && (
            <p className="trip-note">
              <MapPin size={16} /> Track your trip from Home next time to earn points for the full distance.
            </p>
          )}

          {isOther && (
            <input
              className="other-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ready && submit()}
              placeholder="What did you do? e.g. Fixed a leaky tap"
              maxLength={80}
              disabled={busy}
              autoFocus
            />
          )}

          <section className="share-ask">
            <p>Share with {uni.short}’s Spotlight?</p>
            <div className="segment" role="radiogroup" aria-label="Share to Spotlight">
              <button role="radio" aria-checked={!share} className={share ? '' : 'is-on'} onClick={() => setShare(false)} disabled={busy}>
                Keep private
              </button>
              <button role="radio" aria-checked={share} className={share ? 'is-on' : ''} onClick={() => setShare(true)} disabled={busy}>
                <Sparkles size={15} /> Share
              </button>
            </div>
            {share && (
              <span className="share-note">
                Classmates can upvote it. Every {UPVOTE_STEP} upvotes = +{UPVOTE_BONUS} bonus points.
              </span>
            )}
          </section>

          <div className="snap-foot">
            <SpecularButton className="btn-block" disabled={!ready || busy} onClick={submit}>
              {busy ? <span className="spinner" /> : share ? 'Submit & share' : 'Submit'}
            </SpecularButton>
          </div>
        </>
      )}
    </div>
  )
}
