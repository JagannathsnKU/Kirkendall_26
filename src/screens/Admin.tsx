import { useCallback, useEffect, useState } from 'react'
import { Bell, Bot, Camera, ChevronRight, Flag, Inbox, LogOut, Search, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { alertsOn, alertsSupported, enableAlerts } from '../alerts'
import {
  decideFlag,
  flagUser,
  getAdminActivity,
  getAdminOverview,
  getAdminPosts,
  getAdminQueue,
  getAdminUser,
  getAdminUsers,
  markAdminSeen,
  reviewFlag,
  revokeSnap,
  setSuspended,
  signOut,
  takeDownPost,
  takePoints,
} from '../api'
import { fmt } from '../data'
import {
  EVENT_LABELS,
  REPORT_REASONS,
  SUSPICIOUS_EVENTS,
  type ActivityEvent,
  type AdminActivity,
  type AdminOverview,
  type AdminPost,
  type AdminUserDetail,
  type AdminUserRow,
  type AiResponse,
  type AiReview,
  type FlagItem,
} from '../model'
import { go } from '../router'
import { useStore } from '../store'
import { Glyph } from '../glyph'
import { Avatar, ImpactFact, ImpactStats, Logo, Sheet, amount, hideBroken, timeAgo } from '../ui'
import SpecularButton from '../SpecularButton'

type Tab = 'queue' | 'posts' | 'activity' | 'users'

const TABS: { id: Tab; label: string }[] = [
  { id: 'queue', label: 'Queue' },
  { id: 'posts', label: 'Posts' },
  { id: 'activity', label: 'Activity' },
  { id: 'users', label: 'Users' },
]

const fail = (e: unknown) => alert((e as Error).message)

export default function Admin() {
  const { session, alerts, checkAlerts, refresh } = useStore()
  const [tab, setTab] = useState<Tab>('queue')
  const [userId, setUserId] = useState<string | null>(null)
  const [notify, setNotify] = useState(alertsOn)
  if (!session?.user.admin) return null

  const leave = async () => {
    if (!confirm('Sign out of the admin dashboard?')) return
    await signOut()
    await refresh()
    go('welcome', { replace: true })
  }

  return (
    <div className="page admin">
      <header className="top">
        <Logo />
        <button className="icon-btn" onClick={leave} aria-label="Sign out">
          <LogOut size={18} />
        </button>
      </header>

      <div>
        <h1 className="title">Admin</h1>
        <p className="sub">Reports, flags, and suspicious activity at every school.</p>
      </div>

      <Overview open={alerts?.open ?? 0} onQueue={() => setTab('queue')} />

      {alertsSupported && !notify && (
        <div className="install">
          <Bell size={18} />
          <span>Get an alert when something needs review</span>
          <SpecularButton size="sm" onClick={async () => setNotify(await enableAlerts())}>
            Turn on
          </SpecularButton>
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
      {tab === 'posts' && <Posts onUser={setUserId} />}
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

function Overview({ open, onQueue }: { open: number; onQueue: () => void }) {
  const [data, setData] = useState<AdminOverview | null>(null)

  useEffect(() => {
    getAdminOverview().then(setData, () => {})
  }, [])

  if (!data) return null
  return (
    <>
      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat-icon">
            <UsersIcon size={16} />
          </span>
          <strong className="num">{fmt(data.students)}</strong>
          <span>Students</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-icon">
            <Camera size={16} />
          </span>
          <strong className="num">{fmt(data.snapsThisWeek)}</strong>
          <span>Weekly snaps</span>
        </div>
        <button className={`admin-stat${open ? ' is-alert' : ''}`} onClick={onQueue}>
          <span className="admin-stat-icon">
            <Inbox size={16} />
          </span>
          <strong className="num">{fmt(open)}</strong>
          <span>To review</span>
        </button>
      </div>
      <section className="card">
        <p className="label">Impact so far</p>
        <ImpactStats impact={data.impact} compact />
        <ImpactFact impact={data.impact} />
      </section>
    </>
  )
}

/* ───────── AI answers ───────── */

const pct = (v: unknown) => `${Math.round(Number(v) * 100)}%`
const yes = (v: unknown) => v === true

const SHOWN = new Set(['verdict', 'match', 'confidence', 'suspicious', 'duplicate', 'sustainable', 'reason', 'explanation'])

const FIELD_NAMES: Record<string, string> = {
  label: 'Title',
  emoji: 'Emoji',
  headline: 'Headline',
  co2: 'CO₂ (kg)',
  kwh: 'Electricity (kWh)',
  water: 'Water (L)',
  plastic: 'Plastic items',
}

/** Everything an AI answered, laid out so an admin can read it all. */
function AiAnswer({ ai }: { ai: AiResponse }) {
  const chips: { text: string; tone: 'good' | 'bad' | 'warn' | '' }[] = []
  if (ai.verdict !== undefined) chips.push(ai.verdict === 'remove' ? { text: 'Take it down', tone: 'bad' } : { text: 'Looks fine', tone: 'good' })
  if (ai.match !== undefined) chips.push(yes(ai.match) ? { text: 'Shows the action', tone: 'good' } : { text: 'Doesn’t show the action', tone: 'bad' })
  if (ai.confidence !== undefined) chips.push({ text: `${pct(ai.confidence)} sure`, tone: '' })
  if (yes(ai.suspicious)) chips.push({ text: 'Screen or stock photo', tone: 'warn' })
  if (yes(ai.duplicate)) chips.push({ text: 'Same scene as before', tone: 'warn' })
  if (ai.sustainable !== undefined && !yes(ai.sustainable)) chips.push({ text: 'Not sustainable', tone: 'bad' })
  const extra = Object.entries(ai).filter(([k, v]) => !SHOWN.has(k) && v !== '' && v !== null && v !== undefined)

  return (
    <div className="ai-answer">
      {chips.length > 0 && (
        <div className="ai-chips">
          {chips.map((c) => (
            <span key={c.text} className={`ai-chip${c.tone ? ` is-${c.tone}` : ''}`}>
              {c.text}
            </span>
          ))}
        </div>
      )}
      {!!ai.explanation && (
        <div className="ai-field">
          <p className="label">Why</p>
          <p>{String(ai.explanation)}</p>
        </div>
      )}
      {!!ai.reason && (
        <div className="ai-field">
          <p className="label">{ai.verdict !== undefined ? 'Summary' : 'Told the student'}</p>
          <p>“{String(ai.reason)}”</p>
        </div>
      )}
      {extra.length > 0 && (
        <dl className="ai-extra">
          {extra.map(([k, v]) => (
            <div key={k}>
              <dt>{FIELD_NAMES[k] ?? k}</dt>
              <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <details className="ai-raw">
        <summary>Raw response</summary>
        <pre>{JSON.stringify(ai, null, 2)}</pre>
      </details>
    </div>
  )
}

/* ───────── Posts ───────── */

function Posts({ onUser }: { onUser: (id: string) => void }) {
  const [posts, setPosts] = useState<AdminPost[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => getAdminPosts().then(setPosts, (e: Error) => setError(e.message)), [])
  useEffect(() => {
    load()
  }, [load])

  const takeDown = async (p: AdminPost, revoke: boolean) => {
    const question = revoke
      ? `Take down ${p.user.name}’s post and take back its ${p.points} pts?`
      : `Take down ${p.user.name}’s post for everyone?`
    if (!confirm(question)) return
    try {
      await takeDownPost(p.id, revoke)
    } catch (e) {
      fail(e)
    }
    load()
  }

  if (error) return <p className="empty">{error}</p>
  if (!posts) return <Loading />
  if (!posts.length) return <p className="empty">No one has shared to Spotlight yet.</p>
  return (
    <ul className="spots">
      {posts.map((p) => (
        <li key={p.id} className="spot mod">
          <header className="mod-top">
            {p.hidden && <span className="mod-tag is-downvotes">Hidden</span>}
            {p.reports > 0 && <span className="mod-tag is-reports">Reported {p.reports}×</span>}
            <span className="mod-time">{timeAgo(p.ts)}</span>
          </header>
          <button className="mod-user" onClick={() => onUser(p.user.id)}>
            <Avatar name={p.user.name} size={34} />
            <div>
              <strong>{p.user.name}</strong>
              <span>
                <Glyph emoji={p.emoji} size={13} strokeWidth={2} /> {p.label} · {p.user.school} · score {p.score}
              </span>
            </div>
            <ChevronRight size={18} className="chev" />
          </button>
          <div className="spot-media mod-media">
            {p.kind === 'video' ? (
              <video src={p.url} poster={p.poster ?? undefined} controls playsInline muted preload="metadata" />
            ) : (
              <img src={p.url} alt={p.label} loading="lazy" />
            )}
          </div>
          <footer className="mod-actions">
            <div className="mod-btns">
              <button className="btn btn-soft btn-sm" onClick={() => takeDown(p, false)}>
                Take down
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => takeDown(p, true)}>
                Take down + {p.points} pts
              </button>
            </div>
          </footer>
        </li>
      ))}
    </ul>
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
            <Glyph emoji={f.post.emoji} size={13} strokeWidth={2} /> {f.post.label} · score {f.post.score}
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
      <div className="mod-ai-head">
        <Bot size={18} />
        <strong>{title}</strong>
        {(!ai || ai.verdict === 'error') && (
          <button className="btn btn-soft btn-sm" disabled={busy} onClick={onRetry}>
            Ask AI
          </button>
        )}
      </div>
      {ai?.reason && <p>{ai.reason}</p>}
      {ai?.explanation && <p className="mod-ai-why">{ai.explanation}</p>}
    </div>
  )
}

/* ───────── Activity ───────── */

type Show = 'warnings' | 'rejected'

function Activity({ onUser }: { onUser: (id: string) => void }) {
  const [show, setShow] = useState<Show>('warnings')
  const [data, setData] = useState<AdminActivity | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    getAdminActivity(show === 'rejected').then(setData, (e: Error) => setError(e.message))
  }, [show])

  return (
    <>
      <div className="mod-filter">
        <button className={show === 'warnings' ? 'is-on' : ''} onClick={() => setShow('warnings')}>
          Warnings
        </button>
        <button className={show === 'rejected' ? 'is-on' : ''} onClick={() => setShow('rejected')}>
          AI rejections
        </button>
      </div>
      {error ? (
        <p className="empty">{error}</p>
      ) : !data ? (
        <Loading />
      ) : (
        <>
          {show === 'warnings' && data.top.length > 0 && (
            <section>
              <p className="label pad">Most warnings this week</p>
              <ul className="mod-list">
                {data.top.map((t) => (
                  <li key={t.userId}>
                    <button className="mod-row" onClick={() => onUser(t.userId)}>
                      <Avatar name={t.name} size={32} />
                      <strong className="mod-row-name">{t.name}</strong>
                      <span className="mod-count num">{t.count}</span>
                      <ChevronRight size={18} className="chev" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <p className="label pad">Recent</p>
            {data.events.length ? (
              <Events events={data.events} onUser={onUser} />
            ) : (
              <p className="empty">{show === 'rejected' ? 'The AI hasn’t rejected any snaps yet.' : 'No suspicious activity yet.'}</p>
            )}
          </section>
        </>
      )}
    </>
  )
}

const WARNINGS = new Set<string>(SUSPICIOUS_EVENTS)
const tone = (kind: string) => (kind === 'rejected' ? 'is-rejected' : WARNINGS.has(kind) ? 'is-activity' : '')

/** With `onUser`, rows name the student and open their profile; without, they're one user's history. */
function Events({ events, onUser }: { events: ActivityEvent[]; onUser?: (id: string) => void }) {
  return (
    <ul className="mod-list">
      {events.map((e) => (
        <li key={e.id} className="mod-event">
          <div className="mod-event-head">
            {onUser && (
              <button className="mod-event-who" onClick={() => onUser(e.userId)}>
                <Avatar name={e.name} size={26} />
                <strong>{e.name}</strong>
              </button>
            )}
            <span className={`mod-tag ${tone(e.kind)}`}>{EVENT_LABELS[e.kind] ?? e.kind}</span>
            <span className="mod-time">{timeAgo(e.ts)}</span>
          </div>
          {e.detail && <p className="mod-event-detail">{e.detail}</p>}
          {e.by && <p className="mod-event-by">by {e.by}</p>}
          {e.ai && (
            <details className="mod-ai-details">
              <summary>
                <Bot size={15} /> What the AI said
              </summary>
              <AiAnswer ai={e.ai} />
            </details>
          )}
        </li>
      ))}
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
        <ul className="mod-list">
          {rows.map((u) => (
            <li key={u.id}>
              <button className="mod-row" onClick={() => onUser(u.id)}>
                <Avatar name={u.name} size={36} />
                <div className="mod-row-text">
                  <strong>
                    {u.name} <Badges user={u} />
                  </strong>
                  <span>
                    {u.school} · {amount(u.impact.co2)} kg CO₂ · {fmt(u.impact.water)} L · {fmt(u.impact.plastic)} plastic
                  </span>
                </div>
                <span className="mod-count num">{fmt(u.points)}</span>
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
  const [takeBack, setTakeBack] = useState('')
  const [reason, setReason] = useState('')
  const [snapId, setSnapId] = useState<string | null>(null)

  const load = useCallback(() => {
    if (userId) getAdminUser(userId).then(setUser, fail)
  }, [userId])

  useEffect(() => {
    setUser(null)
    setTakeBack('')
    setReason('')
    setSnapId(null)
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
    const n = Math.floor(Number(takeBack))
    if (await act(() => takePoints(user!.id, n, reason), `Take ${n} points from ${user!.name}?`)) {
      setTakeBack('')
      setReason('')
    }
  }

  const flag = () => {
    const note = prompt(`Why are you flagging ${user!.name}?`)
    if (note !== null) act(() => flagUser(user!.id, note))
  }

  const snap = user?.snaps.find((s) => s.id === snapId)

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
            <p className="label">Impact</p>
            <div className="card">
              <ImpactStats impact={user.impact} compact />
              <ImpactFact impact={user.impact} />
            </div>
          </section>

          <section className="mod-section">
            <p className="label">Take back points</p>
            <div className="mod-form">
              <input type="number" inputMode="numeric" min={1} placeholder="Points" value={takeBack} onChange={(e) => setTakeBack(e.target.value)} />
              <input placeholder="Reason (optional)" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />
              <SpecularButton size="sm" disabled={!(Number(takeBack) >= 1)} onClick={take}>
                Take
              </SpecularButton>
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
            <p className="label">Recent snaps · tap one to see what the AI said</p>
            {user.snaps.length ? (
              <div className="snaps">
                {user.snaps.map((s) => (
                  <button key={s.id} className={`snap-open${s.id === snapId ? ' is-picked' : ''}`} onClick={() => setSnapId(s.id === snapId ? null : s.id)}>
                    <figure className="snap">
                      <img src={s.thumb} alt="" onError={hideBroken} />
                      <figcaption>
                        <span className="thumb-icon">
                          <Glyph emoji={s.emoji} size={14} strokeWidth={2} />
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
              <p className="empty">No snaps yet.</p>
            )}
            {snap && (
              <div className="mod-snap">
                <div className="mod-snap-head">
                  <Glyph emoji={snap.emoji} size={16} strokeWidth={2} />
                  <strong>{snap.label}</strong>
                  <span className="mod-time">
                    +{snap.points} pts · {timeAgo(snap.ts)}
                    {snap.posted ? ' · shared' : ''}
                  </span>
                </div>
                {snap.ai ? <AiAnswer ai={snap.ai} /> : <p className="mod-event-by">No AI answer was saved for this snap.</p>}
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() =>
                    act(() => revokeSnap(snap.id), `Remove “${snap.label}” and take back its ${snap.points} pts${snap.posted ? ' plus any Spotlight bonus' : ''}?`)
                  }
                >
                  Revoke snap
                </button>
              </div>
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
