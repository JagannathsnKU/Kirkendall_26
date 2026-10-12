import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react'
import { atDailyLimit, sharePost, submitSnap } from '../api'
import { ACTIONS, OTHER, universityById } from '../data'
import { SPOTLIGHT_BONUSES } from '../model'
import type { Photo } from '../photo'
import { go } from '../router'
import { useStore } from '../store'
import Camera from './Camera'

export default function Snap() {
  const { session, refresh, setResult } = useStore()
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [share, setShare] = useState(false)
  const [checking, setChecking] = useState(false)
  const [sharing, setSharing] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const uni = universityById(session!.user.universityId)

  const clipUrl = useMemo(() => (photo?.video ? URL.createObjectURL(photo.video) : null), [photo])
  useEffect(() => () => void (clipUrl && URL.revokeObjectURL(clipUrl)), [clipUrl])

  const isOther = actionId === OTHER.id
  const ready = !!actionId && (!isOther || note.trim().length >= 3)
  const otherFull = atDailyLimit(session!.snaps, OTHER.id)
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
    const outcome = await submitSnap(actionId, photo, isOther ? note : undefined)
    setChecking(false)
    if (!outcome.ok) {
      setProblem(outcome.message)
      return
    }
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
          <button className="btn btn-primary btn-sm" onClick={retake}>
            Retake
          </button>
        </div>
      ) : (
        <>
          <h1 className="title-sm">What did you do?</h1>
          <div className="actions">
            {ACTIONS.map((a) => {
              const full = atDailyLimit(session!.snaps, a.id)
              return (
                <button
                  key={a.id}
                  className={`action ${actionId === a.id ? 'is-on' : ''}`}
                  onClick={() => setActionId(a.id)}
                  aria-pressed={actionId === a.id}
                  disabled={full || busy}
                >
                  <span className="action-emoji">{a.emoji}</span>
                  <span className="action-label">{a.label}</span>
                  <span className="action-pts">{full ? 'Done today' : `+${a.points}`}</span>
                </button>
              )
            })}
            <button
              className={`action action-other ${isOther ? 'is-on' : ''}`}
              onClick={() => setActionId(OTHER.id)}
              aria-pressed={isOther}
              disabled={otherFull || busy}
            >
              <span className="action-emoji">{OTHER.emoji}</span>
              <span className="action-label">{OTHER.label}</span>
              <span className="action-pts">{otherFull ? 'Done today' : `+${OTHER.points}`}</span>
            </button>
          </div>

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
                Classmates can upvote it. {SPOTLIGHT_BONUSES[0].votes} upvotes = +{SPOTLIGHT_BONUSES[0].bonus} bonus points.
              </span>
            )}
          </section>

          <div className="snap-foot">
            <button className="btn btn-primary btn-block" disabled={!ready || busy} onClick={submit}>
              {busy ? <span className="spinner" /> : share ? 'Submit & share' : 'Submit'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
