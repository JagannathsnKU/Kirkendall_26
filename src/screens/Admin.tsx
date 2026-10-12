import { useCallback, useEffect, useState } from 'react'
import { Bell, Bot, ChevronRight, Flag, Search, ShieldCheck } from 'lucide-react'
import { alertsOn, alertsSupported, enableAlerts } from '../alerts'
import {
  decideFlag,
  flagUser,
  getAdminActivity,
  getAdminQueue,
  getAdminUser,
  getAdminUsers,
  markAdminSeen,
  reviewFlag,
  revokeSnap,
  setSuspended,
  takePoints,
} from '../api'
import { fmt } from '../data'
import {
  EVENT_LABELS,
  REPORT_REASONS,
  type ActivityEvent,
  type AdminActivity,
  type AdminUserDetail,
  type AdminUserRow,
  type AiReview,
  type FlagItem,
} from '../model'
import { go } from '../router'
import { useStore } from '../store'
import { Avatar, Sheet, timeAgo } from '../ui'

type Tab = 'queue' | 'activity' | 'users'

const TABS: { id: Tab; label: string }[] = [
  { id: 'queue', label: 'Queue' },
  { id: 'activity', label: 'Activity' },
  { id: 'users', label: 'Users' },
]

const fail = (e: unknown) => alert((e as Error).message)

export default function Admin() {
  const { session, alerts, checkAlerts } = useStore()
  const [tab, setTab] = useState<Tab>('queue')
  const [userId, setUserId] = useState<string | null>(null)
  const [notify, setNotify] = useState(alertsOn)
  const isAdmin = !!session?.user.admin

  useEffect(() => {
    if (!isAdmin) go('home', { replace: true })
  }, [isAdmin])
  if (!isAdmin) return null

  return (
    <div className="page">
      <div>
        <h1 className="title">Admin</h1>
        <p className="sub">Reports, flags, and suspicious activity at every school.</p>
      </div>

      {alertsSupported && !notify && (
        <div className="install">
          <Bell size={18} />
          <span>Get an alert when something needs review</span>
          <button className="btn btn-sm btn-primary" onClick={async () => setNotify(await enableAlerts())}>
            Turn on
          </button>
        </div>
      )}

      <div className="segment" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'queue' && !!alerts?.open && <span className="count">{alerts.open}</span>}
          </button>
        ))}
      </div>

      {tab === 'queue' && <Queue onUser={setUserId} onChange={checkAlerts} />}
      {tab === 'activity' && <Activity onUser={setUserId} />}
      {tab === 'users' && <Users onUser={setUserId} />}

      <UserSheet userId={userId} onClose={() => setUserId(null)} onChange={checkAlerts} />
    </div>
  )
}

function Loading() {
  return (
    <div className="spot-loading">
      <span className="spinner" />
    </div>
  )
}

/* ───────── Queue ───────── */

function Queue({ onUser, onChange }: { onUser: (id: string) => void; onChange: () => void }) {
  const [items, setItems] = useState<FlagItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => getAdminQueue().then(setItems, (e: Error) => setError(e.message)), [])

  useEffect(() => {
    load()
    markAdminSeen().then(onChange, () => {})
  }, [load, onChange])

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (e) {
      fail(e)
    }
    await load()
    onChange()
  }

  if (error) return <p className="empty">{error}</p>
  if (!items) return <Loading />
  if (!items.length)
    return (
      <div className="empty-snap">
        <ShieldCheck size={26} />
        <strong>All clear</strong>
        <span>Nothing needs review right now.</span>
      </div>
    )
  return (
    <ul className="spots">
      {items.map((f) => (
        <FlagCard key={f.id} flag={f} onUser={onUser} act={act} />
      ))}
    </ul>
  )
}

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id

function flagTitle(f: FlagItem) {
  if (f.reason === 'downvotes') return `Voted down to ${f.post?.score ?? '?'}`
  if (f.reason === 'reports') return `Reported ${f.reports.reduce((n, r) => n + r.count, 0)}×`
  if (f.reason === 'activity') return 'Suspicious activity'
  return 'Flagged by admin'
}

function FlagCard({ flag: f, onUser, act }: { flag: FlagItem; onUser: (id: string) => void; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [revoke, setRevoke] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    await act(fn)
    setBusy(false)
  }

  return (
    <li className="spot mod">
      <header className="mod-top">
        <span className={`mod-tag is-${f.reason}`}>{flagTitle(f)}</span>
        {f.post?.hidden && <span className="mod-tag">Hidden</span>}
        <span className="mod-time">{timeAgo(f.ts)}</span>
      </header>

      <button className="mod-user" onClick={() => onUser(f.user.id)}>
        <Avatar name={f.user.name} size={34} />
        <div>
          <strong>{f.user.name}</strong>
          <span>
            {f.user.school} · {fmt(f.user.points)} pts{f.user.banned ? ' · Suspended' : ''}
          </span>
        </div>
        <ChevronRight size={18} className="chev" />
      </button>

      {f.post && (
        <>
          <div className="spot-media mod-media">
            {f.post.kind === 'video' ? (
              <video src={f.post.url} poster={f.post.poster ?? undefined} controls playsInline muted preload="metadata" />
            ) : (
              <img src={f.post.url} alt={f.post.label} loading="lazy" />
            )}
          </div>
          <p className="mod-line">
            {f.post.emoji} {f.post.label} · score {f.post.score}
          </p>
        </>
      )}

      {f.reports.length > 0 && (
        <p className="mod-line">Reports: {f.reports.map((r) => `${reasonLabel(r.reason)} ×${r.count}`).join(', ')}</p>
      )}
      {f.note && <p className="mod-line">Note: “{f.note}”</p>}
      {f.post && <AiBox ai={f.ai} busy={busy} onRetry={() => run(() => reviewFlag(f.id))} />}

      <footer className="mod-actions">
        {f.post ? (
          <>
            <label className="mod-check">
              <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />
              Also take back {f.post.points} pts
            </label>
            <div className="mod-btns">
              <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => run(() => decideFlag(f.id, 'keep'))}>
                Keep
              </button>
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => decideFlag(f.id, 'remove', revoke))}>
                Take down
              </button>
            </div>
          </>
        ) : (
          <div className="mod-btns">
            <button className="btn btn-soft btn-sm" onClick={() => onUser(f.user.id)}>
              Review user
            </button>
            <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => run(() => decideFlag(f.id, 'dismiss'))}>
              Dismiss
            </button>
          </div>
        )}
      </footer>
    </li>
  )
}

function AiBox({ ai, busy, onRetry }: { ai: AiReview | null; busy: boolean; onRetry: () => void }) {
  const title = !ai ? 'AI review pending' : ai.verdict === 'ok' ? 'AI: looks fine' : ai.verdict === 'remove' ? 'AI: take it down' : 'AI review failed'
  return (
    <div className={`mod-ai is-${ai?.verdict ?? 'pending'}`}>
      <Bot size={18} />
      <div>
        <strong>{title}</strong>
        {ai?.reason && <span>{ai.reason}</span>}
      </div>
      {(!ai || ai.verdict === 'error') && (
        <button className="btn btn-soft btn-sm" disabled={busy} onClick={onRetry}>
          Ask AI
        </button>
      )}
    </div>
  )
}

/* ───────── Activity ───────── */

function Activity({ onUser }: { onUser: (id: string) => void }) {
  const [data, setData] = useState<AdminActivity | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAdminActivity().then(setData, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="empty">{error}</p>
  if (!data) return <Loading />
  return (
    <>
      {data.top.length > 0 && (
        <section>
          <p className="label pad">Most warnings this week</p>
          <ul className="board">
            {data.top.map((t) => (
              <li key={t.userId}>
                <button className="mod-row" onClick={() => onUser(t.userId)}>
                  <Avatar name={t.name} size={32} />
                  <span className="board-name">{t.name}</span>
                  <span className="board-pts num">{t.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <p className="label pad">Recent</p>
        {data.events.length ? <Events events={data.events} onUser={onUser} /> : <p className="empty">No suspicious activity yet.</p>}
      </section>
    </>
  )
}

/** With `onUser`, rows name the student and open their profile; without, they're one user's history. */
function Events({ events, onUser }: { events: ActivityEvent[]; onUser?: (id: string) => void }) {
  return (
    <ul className="board">
      {events.map((e) => {
        const label = EVENT_LABELS[e.kind] ?? e.kind
        const details = [onUser && label, e.detail, e.by && `by ${e.by}`].filter(Boolean).join(' · ')
        return (
          <li key={e.id}>
            <button className="mod-row" onClick={onUser && (() => onUser(e.userId))} disabled={!onUser}>
              <div className="mod-event">
                <strong>{onUser ? e.name : label}</strong>
                {details && <span>{details}</span>}
              </div>
              <span className="mod-time">{timeAgo(e.ts)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/* ───────── Users ───────── */

function Badges({ user }: { user: AdminUserRow }) {
  return (
    <>
      {user.admin && <span className="mod-tag">Admin</span>}
      {user.flagged && <span className="mod-tag is-reports">Flagged</span>}
      {user.banned && <span className="mod-tag is-downvotes">Suspended</span>}
    </>
  )
}

function Users({ onUser }: { onUser: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<AdminUserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => getAdminUsers(q.trim()).then(setRows, (e: Error) => setError(e.message)), 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <>
      <label className="search">
        <Search size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" autoCapitalize="off" />
      </label>
      {error ? (
        <p className="empty">{error}</p>
      ) : !rows ? (
        <Loading />
      ) : !rows.length ? (
        <p className="empty">No one matches “{q}”.</p>
      ) : (
        <ul className="board">
          {rows.map((u) => (
            <li key={u.id}>
              <button className="mod-row" onClick={() => onUser(u.id)}>
                <Avatar name={u.name} size={32} />
                <div className="mod-event">
                  <strong>
                    {u.name} <Badges user={u} />
                  </strong>
                  <span>
                    {u.email} · {u.school}
                  </span>
                </div>
                <span className="board-pts num">{fmt(u.points)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function UserSheet({ userId, onClose, onChange }: { userId: string | null; onClose: () => void; onChange: () => void }) {
  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(() => {
    if (userId) getAdminUser(userId).then(setUser, fail)
  }, [userId])

  useEffect(() => {
    setUser(null)
    setAmount('')
    setReason('')
    load()
  }, [load])

  const act = async (fn: () => Promise<unknown>, question?: string) => {
    if (question && !confirm(question)) return false
    try {
      await fn()
      return true
    } catch (e) {
      fail(e)
      return false
    } finally {
      load()
      onChange()
    }
  }

  const take = async () => {
    const n = Math.floor(Number(amount))
    if (await act(() => takePoints(user!.id, n, reason), `Take ${n} points from ${user!.name}?`)) {
      setAmount('')
      setReason('')
    }
  }

  const flag = () => {
    const note = prompt(`Why are you flagging ${user!.name}?`)
    if (note !== null) act(() => flagUser(user!.id, note))
  }

  return (
    <Sheet open={!!userId} onClose={onClose}>
      {!user ? (
        <Loading />
      ) : (
        <div className="mod-sheet">
          <div className="mod-user is-static">
            <Avatar name={user.name} size={48} />
            <div>
              <strong>
                {user.name} <Badges user={user} />
              </strong>
              <span>
                {user.email} · {user.school}
              </span>
            </div>
            <strong className="num mod-points">{fmt(user.points)} pts</strong>
          </div>

          <section className="mod-section">
            <p className="label">Take back points</p>
            <div className="mod-form">
              <input type="number" inputMode="numeric" min={1} placeholder="Points" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <input placeholder="Reason (optional)" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={!(Number(amount) >= 1)} onClick={take}>
                Take
              </button>
            </div>
          </section>

          {!user.admin && (
            <section className="mod-section">
              <p className="label">Decisions</p>
              <div className="mod-btns">
                <button className="btn btn-soft btn-sm" onClick={flag} disabled={user.flagged}>
                  <Flag size={16} /> {user.flagged ? 'Flagged' : 'Flag for review'}
                </button>
                <button
                  className={`btn btn-sm ${user.banned ? 'btn-soft' : 'btn-danger'}`}
                  onClick={() =>
                    act(
                      () => setSuspended(user.id, !user.banned),
                      user.banned ? `Let ${user.name} log in again?` : `Suspend ${user.name}? They’re signed out, can’t log in, and drop off the leaderboards.`,
                    )
                  }
                >
                  {user.banned ? 'Unsuspend' : 'Suspend'}
                </button>
              </div>
            </section>
          )}

          <section className="mod-section">
            <p className="label">Recent snaps</p>
            {user.snaps.length ? (
              <div className="snaps">
                {user.snaps.map((s) => (
                  <figure key={s.id} className="snap">
                    <img src={s.thumb} alt="" />
                    <button
                      className="mod-revoke"
                      onClick={() => act(() => revokeSnap(s.id), `Remove “${s.label}” and take back its ${s.points} pts${s.posted ? ' plus any Spotlight bonus' : ''}?`)}
                    >
                      Revoke
                    </button>
                    <figcaption>
                      <span>{s.emoji}</span>
                      <span>
                        +{s.points} · {timeAgo(s.ts)}
                      </span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="empty">No snaps yet.</p>
            )}
          </section>

          <section className="mod-section">
            <p className="label">History</p>
            {user.events.length ? <Events events={user.events} /> : <p className="empty">Nothing logged.</p>}
          </section>
        </div>
      )}
    </Sheet>
  )
}
