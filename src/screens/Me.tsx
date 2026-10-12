import { useState } from 'react'
import { ChevronRight, Download, LogOut, Pencil, ShieldCheck } from 'lucide-react'
import { signOut } from '../api'
import { fmt, universityById } from '../data'
import { useInstall } from '../install'
import { go } from '../router'
import { useStore } from '../store'
import { Avatar, Sheet } from '../ui'

export default function Me() {
  const { session, refresh } = useStore()
  const { mode, install } = useInstall()
  const [iosHelp, setIosHelp] = useState(false)
  const { user } = session!

  const leave = async () => {
    if (!confirm('Sign out? You can log back in with your email.')) return
    await signOut()
    await refresh()
    go('welcome', { replace: true })
  }

  return (
    <div className="page">
      <div className="me-head">
        <Avatar name={user.name} size={72} />
        <h1 className="title">{user.name}</h1>
        <p className="sub">{universityById(user.universityId).name}</p>
      </div>

      <div className="stats">
        <div>
          <strong className="num">{fmt(user.points)}</strong>
          <span>points</span>
        </div>
        <div>
          <strong className="num">🔥 {user.streak.best}</strong>
          <span>best streak</span>
        </div>
        <div>
          <strong className="num">{fmt(user.impact.co2, 1)}</strong>
          <span>kg CO₂</span>
        </div>
      </div>

      <ul className="menu">
        {user.admin && (
          <li>
            <button onClick={() => go('admin')}>
              <ShieldCheck size={18} /> Admin <ChevronRight size={18} className="chev" />
            </button>
          </li>
        )}
        <li>
          <button onClick={() => go('setup')}>
            <Pencil size={18} /> Edit profile <ChevronRight size={18} className="chev" />
          </button>
        </li>
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
