import { useState } from 'react'
import { AlertCircle, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { atDailyLimit, submitSnap } from '../api'
import { ACTIONS, OTHER } from '../data'
import type { Photo } from '../photo'
import { go } from '../router'
import { useStore } from '../store'
import Camera from './Camera'

export default function Snap() {
  const { session, refresh, setResult } = useStore()
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const isOther = actionId === OTHER.id
  const ready = !!actionId && (!isOther || note.trim().length >= 3)
  const otherFull = atDailyLimit(session!.snaps, OTHER.id)

  const close = () => go('home')
  const retake = () => {
    setPhoto(null)
    setProblem(null)
  }

  const submit = async () => {
    if (!photo || !actionId || !ready || checking) return
    setChecking(true)
    setProblem(null)
    const outcome = await submitSnap(actionId, photo, isOther ? note : undefined)
    if (!outcome.ok) {
      setChecking(false)
      setProblem(outcome.message)
      return
    }
    await refresh()
    setResult(outcome.result)
    go('result', { replace: true })
  }

  if (!photo) return <Camera onCapture={setPhoto} onClose={close} />

  return (
    <div className="snap-screen">
      <div className="bar-top">
        <button className="icon-btn" onClick={close} aria-label="Close">
          <X size={22} />
        </button>
        <button className="icon-btn" onClick={retake} aria-label="Retake" disabled={checking}>
          <RotateCcw size={20} />
        </button>
      </div>

      <div className={`preview-wrap ${checking ? 'is-checking' : ''}`}>
        <img className="preview" src={photo.preview} alt="Your snapshot" />
        {checking && (
          <div className="checking">
            <ShieldCheck size={22} /> Checking your photo…
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
                  disabled={full || checking}
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
              disabled={otherFull || checking}
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
              disabled={checking}
              autoFocus
            />
          )}

          <div className="snap-foot">
            <button className="btn btn-primary btn-block" disabled={!ready || checking} onClick={submit}>
              {checking ? <span className="spinner" /> : 'Submit'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
