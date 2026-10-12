import { useEffect, useMemo, useState } from 'react'
import { Bus, Camera, ChevronRight, Download, Flame, Footprints, MapPin, Play, Snowflake, Sparkles, X } from 'lucide-react'
import Aurora from '../Aurora'
import { getSnapDetail, getStudentLeaderboard } from '../api'
import { REWARDS, SNAP_TTL_DAYS, actionById, fmt, universityById } from '../data'
import { useInstall } from '../install'
import type { Snap, SnapDetail } from '../model'
import { go } from '../router'
import { useStore } from '../store'
import { Glyph } from '../glyph'
import { milesText, summarize } from '../route'
import { dayKey, nextMilestone, streakNow, type Streak } from '../streak'
import { pendingTrip, useTrip } from '../tracker'
import { Tree } from '../tree'
import { Avatar, Bar, CountUp, ImpactFact, ImpactStats, Logo, Sheet, hideBroken, timeAgo } from '../ui'
import SpecularButton from '../SpecularButton'

const DAY_MS = 24 * 60 * 60 * 1000
const AURORA = ['#0c0d0c', '#022c22', '#0c0d0c']

export default function Home() {
  const { session, openCamera } = useStore()
  const { mode, install } = useInstall()
  const [rank, setRank] = useState<number | null>(null)
  const [open, setOpen] = useState<Snap | null>(null)
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
    <div className="page home">
      <header className="top">
        <Logo />
        <button onClick={() => go('me')} aria-label="Profile">
          <Avatar name={user.name} src={user.avatar} size={36} />
        </button>
      </header>

      {mode && !hideInstall && (
        <div className="install">
          <Download size={18} />
          <span>{mode === 'ios' ? 'Tap Share → Add to Home Screen' : 'Get EcoU on your home screen'}</span>
          {mode === 'prompt' && (
            <SpecularButton size="sm" onClick={install}>
              Install
            </SpecularButton>
          )}
          <button className="icon-btn sm" onClick={dismissInstall} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="hero">
        <Aurora className="hero-aurora" colorStops={AURORA} amplitude={0.9} blend={0.6} height={0.5} speed={0.35} glow={0.7} opacity={0.55} mouseInteraction={false} />
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

      <section className="card impact-card">
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
        <ImpactFact impact={user.impact} />
      </section>

      <StreakCard streak={user.streak} onSnap={openCamera} />

      <TripCard onSnap={openCamera} />

      <section>
        <p className="label pad">This week</p>
        {snaps.length ? (
          <div className="snaps">
            {snaps.slice(0, 9).map((s) => (
              <button key={s.id} className="snap-open" onClick={() => setOpen(s)} aria-label={`Open ${s.label} snap`}>
                <figure className="snap">
                  <img src={s.thumb} alt="" onError={hideBroken} />
                  {s.kind === 'video' && (
                    <span className="snap-play" aria-label="Video">
                      <Play size={12} fill="currentColor" />
                    </span>
                  )}
                  <figcaption>
                    <span className="thumb-icon">
                      <Glyph emoji={s.emoji ?? actionById(s.actionId)?.emoji} size={14} strokeWidth={2} />
                    </span>
                    <span>
                      +{s.points} · {timeAgo(s.ts)}
                    </span>
                  </figcaption>
                </figure>
              </button>
            ))}
          </div>
        ) : (
          <button className="empty-snap" onClick={openCamera}>
            <Camera size={26} />
            <strong>Snap your first green action</strong>
          </button>
        )}
      </section>

      <SnapSheet snap={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function SnapSheet({ snap, onClose }: { snap: Snap | null; onClose: () => void }) {
  const [detail, setDetail] = useState<SnapDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    if (snap) getSnapDetail(snap.id).then(setDetail, (e: Error) => setError(e.message))
  }, [snap])

  if (!snap) return null
  const daysLeft = Math.max(1, Math.ceil((snap.ts + SNAP_TTL_DAYS * DAY_MS - Date.now()) / DAY_MS))
  const post = detail?.post
  const image = post?.kind === 'photo' ? post.url : detail?.photo || snap.thumb
  const when = new Date(snap.ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <Sheet open onClose={onClose}>
      <div className="snap-detail">
        <div className="snap-detail-media">
          {post?.kind === 'video' ? (
            <video src={post.url} poster={post.poster ?? image} controls autoPlay loop muted playsInline />
          ) : (
            <img src={image} alt={snap.label} />
          )}
        </div>

        <div className="snap-detail-head">
          <span className="snap-detail-icon">
            <Glyph emoji={snap.emoji} size={22} />
          </span>
          <div>
            <strong>{snap.label}</strong>
            <span>{when}</span>
          </div>
          <strong className="snap-detail-pts">+{snap.points}</strong>
        </div>

        {error ? (
          <p className="empty">{error}</p>
        ) : !detail ? (
          <div className="spot-loading">
            <span className="spinner" />
          </div>
        ) : (
          <>
            {detail.analogy && (
              <section className="analogy snap-analogy">
                <span className="analogy-icon">
                  <Glyph emoji={detail.analogyEmoji} size={22} />
                </span>
                <p className="analogy-text">{detail.analogy}</p>
                {detail.headline && <p className="analogy-fact">{detail.headline}</p>}
              </section>
            )}
            {detail.impact && <ImpactStats impact={detail.impact} compact />}
            {detail.trip && (
              <p className="snap-detail-note">
                <MapPin size={14} /> GPS trip · {milesText(detail.trip.miles)} in {Math.round(detail.trip.minutes)} min · {detail.trip.avgMph} mph avg
              </p>
            )}
            {post && (
              <p className="snap-detail-note">
                <Sparkles size={14} /> Shared to Spotlight · {post.score} {Math.abs(post.score) === 1 ? 'vote' : 'votes'}
              </p>
            )}
          </>
        )}

        <p className="snap-detail-note">
          Snaps disappear after {SNAP_TTL_DAYS} days; this one in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}. Your points and impact stay.
        </p>
      </div>
    </Sheet>
  )
}

function TripCard({ onSnap }: { onSnap: () => void }) {
  const { trip } = useTrip()
  const done = pendingTrip(trip)
  const live = trip && !trip.end ? trip : null
  const miles = useMemo(() => (trip ? summarize(trip.points).miles : 0), [trip])

  return (
    <section className="card trip-card">
      <span className="icon-tile" aria-hidden>
        {trip?.mode === 'bus' ? <Bus size={20} /> : <Footprints size={20} />}
      </span>
      <div>
        <strong>{done ? 'Trip finished' : live ? 'Trip in progress' : 'Going somewhere?'}</strong>
        <span>
          {done
            ? `${milesText(miles)} tracked. Snap it to earn your points.`
            : live
              ? `${milesText(miles)} so far. Keep EcoU open.`
              : 'Track a walk, bike or transit ride. Longer trips earn more.'}
        </span>
      </div>
      {done ? (
        <SpecularButton size="sm" onClick={onSnap}>
          Snap
        </SpecularButton>
      ) : (
        <button className="btn btn-soft btn-sm" onClick={() => go('trip')}>
          {live ? 'Open' : 'Track'}
        </button>
      )}
    </section>
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
        <span className="icon-tile is-flame" aria-hidden>
          <Flame size={18} />
        </span>
        <div className="streak-text">
          <p>
            <strong className="num">{count}</strong> day streak
            {streak.freezes > 0 && (
              <span className="streak-freeze" aria-label={`${streak.freezes} streak freeze${streak.freezes > 1 ? 's' : ''}`}>
                <Snowflake size={12} /> {streak.freezes}
              </span>
            )}
          </p>
          <span>{message}</span>
        </div>
        {status !== 'done' && (
          <SpecularButton size="sm" onClick={onSnap}>
            Snap
          </SpecularButton>
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
    </section>
  )
}
