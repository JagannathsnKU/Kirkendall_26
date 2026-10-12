import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, ChevronRight, Download, ImageMinus, LogOut, Pencil } from 'lucide-react'
import { signOut, updateAvatar } from '../api'
import { fmt, universityById } from '../data'
import { useInstall } from '../install'
import { avatarFromFile } from '../photo'
import { go } from '../router'
import { useStore } from '../store'
import { Avatar, Sheet } from '../ui'

export default function Me() {
  const { session, refresh } = useStore()
  const { mode, install } = useInstall()
  const [iosHelp, setIosHelp] = useState(false)
  const [busy, setBusy] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const { user } = session!

  const leave = async () => {
    if (!confirm('Sign out? You can log back in with your email.')) return
    await signOut()
    await refresh()
    go('welcome', { replace: true })
  }

  const saveAvatar = async (image: string) => {
    setBusy(true)
    try {
      await updateAvatar(image)
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    }
    setBusy(false)
  }

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await saveAvatar(await avatarFromFile(file))
    } catch (err) {
      alert((err as Error).message)
    }
  }

  return (
    <div className="page">
      <div className="me-head">
        <button className="me-avatar" onClick={() => picker.current?.click()} disabled={busy} aria-label={user.avatar ? 'Change profile picture' : 'Add profile picture'}>
          <Avatar name={user.name} src={user.avatar} size={84} />
          <span className="me-avatar-badge">{busy ? <span className="spinner" /> : <Camera size={15} strokeWidth={2.2} />}</span>
        </button>
        <input ref={picker} type="file" accept="image/*" hidden onChange={pick} />
        <h1 className="title">{user.name}</h1>
        <p className="sub">{universityById(user.universityId).name}</p>
      </div>

      <div className="stats">
        <div>
          <strong className="num">{fmt(user.points)}</strong>
          <span>points</span>
        </div>
        <div>
          <strong className="num">{user.streak.best}</strong>
          <span>best streak</span>
        </div>
        <div>
          <strong className="num">{fmt(user.impact.co2, 1)}</strong>
          <span>kg CO₂</span>
        </div>
      </div>

      <ul className="menu">
        <li>
          <button onClick={() => go('setup')}>
            <Pencil size={18} /> Edit profile <ChevronRight size={18} className="chev" />
          </button>
        </li>
        <li>
          <button onClick={() => picker.current?.click()} disabled={busy}>
            <Camera size={18} /> {user.avatar ? 'Change photo' : 'Add a profile photo'} <ChevronRight size={18} className="chev" />
          </button>
        </li>
        {user.avatar && (
          <li>
            <button onClick={() => confirm('Remove your profile photo?') && saveAvatar('')} disabled={busy}>
              <ImageMinus size={18} /> Remove photo
            </button>
          </li>
        )}
        {mode && (
          <li>
            <button onClick={() => (mode === 'prompt' ? install() : setIosHelp(true))}>
              <Download size={18} /> Install app <ChevronRight size={18} className="chev" />
            </button>
          </li>
        )}
        <li>
          <button className="danger" onClick={leave}>
            <LogOut size={18} /> Sign out
          </button>
        </li>
      </ul>

      <Sheet open={iosHelp} onClose={() => setIosHelp(false)}>
        <div className="redeem">
          <h2 className="title-sm">Add to Home Screen</h2>
          <p className="sub">In Safari, tap the Share button, then “Add to Home Screen”.</p>
          <button className="btn btn-soft btn-block" onClick={() => setIosHelp(false)}>
            Got it
          </button>
        </div>
      </Sheet>
    </div>
  )
}
