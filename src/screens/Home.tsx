import { useEffect, useState } from 'react'
import { Camera, ChevronRight, Download, X } from 'lucide-react'
import { getStudentLeaderboard } from '../api'
import { KM_PER_KG_CO2, REWARDS, actionById, fmt, universityById } from '../data'
import { useInstall } from '../install'
import { go } from '../router'
import { useStore } from '../store'
import { dayKey, nextMilestone, streakNow, type Streak } from '../streak'
import { Tree } from '../tree'
import { Avatar, Bar, CountUp, Logo, timeAgo } from '../ui'

export default function Home() {
  const { session, openCamera } = useStore()
  const { mode, install } = useInstall()
  const [rank, setRank] = useState<number | null>(null)
  const [hideInstall, setHideInstall] = useState(() => localStorage.getItem('ecou:hide-install') === '1')
  const { user, snaps } = session!
  const uni = universityById(user.universityId)
  const next = REWARDS.find((r) => r.points > user.points)
  const prev = [...REWARDS].reverse().find((r) => r.points <= user.points)?.points ?? 0

  useEffect(() => {
    getStudentLeaderboard().then(
      (rows) => setRank(rows.findIndex((r) => r.me) + 1),
      () => {},
    )
  }, [user.points])

  const dismissInstall = () => {
    localStorage.setItem('ecou:hide-install', '1')
    setHideInstall(true)
  }

  return (
    <div className="page">
      <header className="top">
        <Logo />
        <button onClick={() => go('me')} aria-label="Profile">
          <Avatar name={user.name} size={36} />
        </button>
      </header>

      {mode && !hideInstall && (
        <div className="install">
          <Download size={18} />
          <span>{mode === 'ios' ? 'Tap Share → Add to Home Screen' : 'Get EcoU on your home screen'}</span>
          {mode === 'prompt' && (
            <button className="btn btn-sm btn-primary" onClick={install}>
              Install
            </button>
          )}
          <button className="icon-btn sm" onClick={dismissInstall} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="hero">
        <div className="hero-head">
          <div>
            <p className="label">Points</p>
            <p className="hero-num">
              <CountUp value={user.points} />
            </p>
            <button className="hero-rank" onClick={() => go('board')}>
              {rank ? `#${rank} at ${uni.short}` : uni.short}
              <ChevronRight size={16} />
            </button>
          </div>
          <Tree points={user.points} />
        </div>
        {next && (
          <div className="hero-next">
            <Bar value={user.points - prev} max={next.points - prev} />
            <span>
              {fmt(next.points - user.points)} to {next.shop}
            </span>
          </div>
        )}
      </section>

      <StreakCard streak={user.streak} onSnap={openCamera} />

      <section className="card">
        <p className="label">Your impact</p>
        <div className="impact-grid">
          <div>
            <strong>{fmt(user.impact.co2, 1)}</strong>
            <span>kg CO₂</span>
          </div>
          <div>
            <strong>{fmt(user.impact.kwh, 1)}</strong>
            <span>kWh</span>
          </div>
          <div>
            <strong>{fmt(user.impact.water)}</strong>
            <span>L water</span>
          </div>
        </div>
        {user.impact.co2 > 0 && <p className="analogy-line">🚗 Like not driving {fmt(user.impact.co2 * KM_PER_KG_CO2)} km</p>}
      </section>

      <section>
        <p className="label pad">Recent</p>
        {snaps.length ? (
          <div className="snaps">
            {snaps.slice(0, 9).map((s) => (
              <figure key={s.id} className="snap">
                <img src={s.thumb} alt="" />
                <figcaption>
                  <span>{s.emoji ?? actionById(s.actionId)?.emoji}</span>
                  <span>
                    +{s.points} · {timeAgo(s.ts)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <button className="empty-snap" onClick={openCamera}>
            <Camera size={26} />
            <strong>Snap your first green action</strong>
          </button>
        )}
      </section>
    </div>
  )
}

function StreakCard({ streak, onSnap }: { streak: Streak; onSnap: () => void }) {
  const today = dayKey()
  const { count, status } = streakNow(streak, today)
  const next = nextMilestone(count)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + i)
    return { key: dayKey(d), letter: d.toLocaleDateString('en-US', { weekday: 'narrow' }) }
  })
  const toGo = next ? next.days - count : 0
  const message =
    status === 'due'
      ? 'Snap today to keep it going'
      : status === 'none'
        ? 'Snap today to start a streak'
        : next
          ? `${toGo} more ${toGo === 1 ? 'day' : 'days'} to a +${next.bonus} bonus`
          : 'Legendary. See you tomorrow!'

  return (
    <section className={`card streak is-${status}`}>
      <div className="streak-top">
        <span className="streak-flame" aria-hidden>
          🔥
        </span>
        <strong className="num">{count}</strong>
        <span className="streak-unit">day streak</span>
        {streak.freezes > 0 && (
          <span className="streak-freeze" aria-label={`${streak.freezes} streak freeze${streak.freezes > 1 ? 's' : ''}`}>
            ❄️ {streak.freezes}
          </span>
        )}
      </div>
      <div className="streak-week">
        {week.map((d) => {
          const state = streak.days.includes(d.key)
            ? 'is-on'
            : streak.frozen.includes(d.key)
              ? 'is-frozen'
              : d.key > today
                ? 'is-future'
                : ''
          return (
            <span key={d.key} className={`streak-day ${state} ${d.key === today ? 'is-today' : ''}`}>
              {d.letter}
            </span>
          )
        })}
      </div>
      <div className="streak-foot">
        <span>{message}</span>
        {status !== 'done' && (
          <button className="btn btn-primary btn-sm" onClick={onSnap}>
            Snap
          </button>
        )}
      </div>
    </section>
  )
}
