/* Admin endpoints: the review queue, suspicious activity, and actions on users and posts. */
import type { IncomingMessage } from 'node:http'
import { universityById } from '../src/data.ts'
import {
  SUSPICIOUS_EVENTS,
  type ActivityEvent,
  type AdminActivity,
  type AdminOverview,
  type AdminPost,
  type AdminSummary,
  type AdminUserDetail,
  type AdminUserRow,
  type FlagItem,
} from '../src/model.ts'
import { isAdmin, notAdmin, requireAdmin } from './auth.ts'
import { db, type Sql } from './db.ts'
import { HttpError, readJson, str } from './http.ts'
import { flagUser, logEvent, reviewFlag, revokeSnap, takeDown } from './moderation.ts'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const MAX_TAKE_BACK = 100_000

interface UserCols {
  id: string
  name: string
  email: string
  university_id: string
  points: number
  co2: number
  kwh: number
  water: number
  plastic: number
  banned: boolean
  flagged: boolean
}

const toRow = (u: UserCols): AdminUserRow => ({
  id: u.id,
  name: u.name,
  email: u.email,
  school: universityById(u.university_id).short,
  points: u.points,
  impact: { co2: u.co2, kwh: u.kwh, water: u.water, plastic: u.plastic },
  banned: u.banned,
  flagged: u.flagged,
  admin: isAdmin(u.email),
})

const userCols = (sql: Sql) => sql`
  u.id, u.name, u.email, u.university_id, u.points, u.co2, u.kwh, u.water, u.plastic, u.banned,
  exists (select 1 from flags f where f.user_id = u.id and f.kind = 'user' and f.status = 'open') as flagged`

const toEvent = (e: { id: string; user_id: string; name: string; kind: string; detail: string; by: string | null; ts: string }): ActivityEvent => ({
  id: String(e.id),
  userId: e.user_id,
  name: e.name,
  kind: e.kind,
  detail: e.detail,
  by: e.by,
  ts: Number(e.ts),
})

const query = (req: IncomingMessage) => new URL(req.url ?? '/', 'http://localhost').searchParams

export async function summary(req: IncomingMessage): Promise<AdminSummary> {
  const sql = await db()
  const adminId = await requireAdmin(sql, req)
  const [row] = await sql<AdminSummary[]>`
    select count(*)::int as open,
      count(*) filter (where f.ts > (select admin_seen_at from users where id = ${adminId}))::int as unread
    from flags f where f.status = 'open'`
  return row
}

export async function overview(req: IncomingMessage): Promise<AdminOverview> {
  const sql = await db()
  await requireAdmin(sql, req)
  const [totals] = await sql<{ students: number; co2: number; kwh: number; water: number; plastic: number }[]>`
    select count(*)::int as students, coalesce(sum(co2), 0)::float as co2, coalesce(sum(kwh), 0)::float as kwh,
      coalesce(sum(water), 0)::int as water, coalesce(sum(plastic), 0)::int as plastic
    from users where ${notAdmin(sql)}`
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from snaps where ts > ${Date.now() - WEEK_MS}`
  const { students, ...impact } = totals
  return { students, snapsThisWeek: n, impact }
}

/** Every school's Spotlight, newest first, including posts hidden for review. */
export async function posts(req: IncomingMessage): Promise<AdminPost[]> {
  const sql = await db()
  await requireAdmin(sql, req)
  const rows = await sql`
    select p.id, p.kind, p.url, p.poster, p.label, p.emoji, p.score, p.hidden, p.bonus, p.ts, s.points,
      u.id as user_id, u.name, u.university_id,
      (select count(*)::int from reports r where r.post_id = p.id) as reports
    from posts p join users u on u.id = p.user_id join snaps s on s.id = p.snap_id
    order by p.ts desc limit 60`
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    url: r.url,
    poster: r.poster,
    label: r.label,
    emoji: r.emoji,
    score: r.score,
    hidden: r.hidden,
    reports: r.reports,
    points: r.points + r.bonus,
    ts: Number(r.ts),
    user: { id: r.user_id, name: r.name, school: universityById(r.university_id).short },
  }))
}

export async function markSeen(req: IncomingMessage) {
  const sql = await db()
  const adminId = await requireAdmin(sql, req)
  await sql`update users set admin_seen_at = ${Date.now()} where id = ${adminId}`
  return { ok: true }
}

export async function queue(req: IncomingMessage): Promise<FlagItem[]> {
  const sql = await db()
  await requireAdmin(sql, req)
  const rows = await sql`
    select f.id as flag_id, f.kind as flag_kind, f.reason, f.note, f.ai_verdict, f.ai_reason, f.ts as flag_ts, ${userCols(sql)},
      p.id as post_id, p.kind as post_kind, p.url, p.poster, p.label, p.emoji, p.score, p.hidden, p.bonus, s.points as snap_points
    from flags f
    join users u on u.id = f.user_id
    left join posts p on p.id = f.post_id
    left join snaps s on s.id = p.snap_id
    where f.status = 'open'
    order by f.ts desc
    limit 100`
  const postIds = rows.map((r) => r.post_id).filter(Boolean)
  const reports = postIds.length
    ? await sql<{ post_id: string; reason: string; n: number }[]>`
        select post_id, reason, count(*)::int as n from reports where post_id in ${sql(postIds)}
        group by post_id, reason order by n desc`
    : []

  return rows.map((r) => ({
    id: r.flag_id,
    kind: r.flag_kind,
    reason: r.reason,
    note: r.note,
    reports: reports.filter((x) => x.post_id === r.post_id).map((x) => ({ reason: x.reason, count: x.n })),
    ai: r.ai_verdict ? { verdict: r.ai_verdict, reason: r.ai_reason ?? '' } : null,
    ts: Number(r.flag_ts),
    user: toRow(r as unknown as UserCols),
    post: r.post_id
      ? {
          id: r.post_id,
          kind: r.post_kind,
          url: r.url,
          poster: r.poster,
          label: r.label,
          emoji: r.emoji,
          score: r.score,
          hidden: r.hidden,
          points: r.snap_points + r.bonus,
        }
      : null,
  }))
}

export async function activity(req: IncomingMessage): Promise<AdminActivity> {
  const sql = await db()
  await requireAdmin(sql, req)
  const events = await sql`
    select e.id, e.user_id, u.name, e.kind, e.detail, a.name as by, e.ts
    from events e join users u on u.id = e.user_id left join users a on a.id = e.actor_id
    where e.kind in ${sql(SUSPICIOUS_EVENTS)}
    order by e.ts desc limit 100`
  const top = await sql<{ user_id: string; name: string; n: number }[]>`
    select e.user_id, u.name, count(*)::int as n
    from events e join users u on u.id = e.user_id
    where e.kind in ${sql(SUSPICIOUS_EVENTS)} and e.ts > ${Date.now() - WEEK_MS} and ${notAdmin(sql)}
    group by e.user_id, u.name order by n desc limit 5`
  return {
    top: top.map((t) => ({ userId: t.user_id, name: t.name, count: t.n })),
    events: events.map((e) => toEvent(e as never)),
  }
}

export async function users(req: IncomingMessage): Promise<AdminUserRow[]> {
  const sql = await db()
  await requireAdmin(sql, req)
  const q = str(query(req).get('q'), 100).toLowerCase()
  const rows = await sql<UserCols[]>`
    select ${userCols(sql)} from users u
    where ${q} = '' or position(${q} in lower(u.name)) > 0 or position(${q} in u.email) > 0
    order by u.points desc limit 60`
  return rows.filter((u) => !isAdmin(u.email)).map(toRow)
}

export async function user(req: IncomingMessage): Promise<AdminUserDetail> {
  const sql = await db()
  await requireAdmin(sql, req)
  const id = str(query(req).get('id'), 64)
  const [u] = await sql<UserCols[]>`select ${userCols(sql)} from users u where u.id = ${id}`
  if (!u) throw new HttpError(404, 'User not found.')
  const snaps = await sql`
    select s.id, s.action_id, s.label, s.emoji, s.kind, s.ts, s.points, s.thumb,
      exists (select 1 from posts p where p.snap_id = s.id) as posted
    from snaps s where s.user_id = ${id} order by s.ts desc limit 30`
  const events = await sql`
    select e.id, e.user_id, u.name, e.kind, e.detail, a.name as by, e.ts
    from events e join users u on u.id = e.user_id left join users a on a.id = e.actor_id
    where e.user_id = ${id} order by e.ts desc limit 60`
  return {
    ...toRow(u),
    snaps: snaps.map((s) => ({
      id: s.id,
      actionId: s.action_id,
      label: s.label,
      emoji: s.emoji,
      kind: s.kind,
      ts: Number(s.ts),
      points: s.points,
      thumb: s.thumb,
      posted: s.posted,
    })),
    events: events.map((e) => toEvent(e as never)),
  }
}

/** Resolves a queue item. Posts: keep (back in the feed for good) or remove. Users: dismiss. */
export async function decide(req: IncomingMessage) {
  const sql = await db()
  const adminId = await requireAdmin(sql, req)
  const body = await readJson(req)
  const decision = str(body.decision, 16)
  if (!['keep', 'remove', 'dismiss'].includes(decision)) throw new HttpError(400, 'Unknown decision.')

  const [flag] = await sql<{ id: string; user_id: string; post_id: string | null }[]>`
    update flags set status = 'resolved', decision = ${decision}, resolved_by = ${adminId}, resolved_at = ${Date.now()}
    where id = ${str(body.flagId, 64)} and status = 'open'
    returning id, user_id, post_id`
  if (!flag) throw new HttpError(404, 'Someone already handled this.')

  if (decision === 'remove') {
    if (!flag.post_id) throw new HttpError(400, 'Only posts can be removed.')
    await takeDown(sql, flag.post_id, adminId, body.revoke === true)
  } else if (flag.post_id) {
    const [post] = await sql<{ label: string }[]>`
      update posts set hidden = false, reviewed = true where id = ${flag.post_id} returning label`
    await logEvent(sql, flag.user_id, 'kept', post?.label ?? '', adminId)
  } else {
    await logEvent(sql, flag.user_id, 'cleared', '', adminId)
  }
  return { ok: true }
}

export async function rereview(req: IncomingMessage) {
  const sql = await db()
  await requireAdmin(sql, req)
  await reviewFlag(sql, str((await readJson(req)).flagId, 64))
  return { ok: true }
}

export async function takePoints(req: IncomingMessage) {
  const sql = await db()
  const adminId = await requireAdmin(sql, req)
  const body = await readJson(req)
  const amount = Math.floor(Number(body.amount))
  if (!(amount > 0 && amount <= MAX_TAKE_BACK)) throw new HttpError(400, 'Enter how many points to take back.')
  const reason = str(body.reason, 120)
  const [u] = await sql`
    update users set points = greatest(points - ${amount}, 0) where id = ${str(body.userId, 64)} returning id`
  if (!u) throw new HttpError(404, 'User not found.')
  await logEvent(sql, u.id, 'points', reason ? `−${amount}: ${reason}` : `−${amount}`, adminId)
  return { ok: true }
}

export async function revoke(req: IncomingMessage) {
  const sql = await db()
  const adminId = await requireAdmin(sql, req)
  await revokeSnap(sql, str((await readJson(req)).snapId, 64), adminId)
  return { ok: true }
}

export async function takedown(req: IncomingMessage) {
  const sql = await db()
  const adminId = await requireAdmin(sql, req)
  const body = await readJson(req)
  await takeDown(sql, str(body.postId, 64), adminId, body.revoke === true)
  return { ok: true }
}

export async function flag(req: IncomingMessage) {
  const sql = await db()
  const adminId = await requireAdmin(sql, req)
  const body = await readJson(req)
  const userId = str(body.userId, 64)
  const note = str(body.note, 200)
  const [u] = await sql`select id from users where id = ${userId}`
  if (!u) throw new HttpError(404, 'User not found.')
  await flagUser(sql, userId, 'admin', note)
  await logEvent(sql, userId, 'flagged', note, adminId)
  return { ok: true }
}

export async function ban(req: IncomingMessage) {
  const sql = await db()
  const adminId = await requireAdmin(sql, req)
  const body = await readJson(req)
  const banned = body.banned === true
  const [u] = await sql<{ id: string; email: string }[]>`select id, email from users where id = ${str(body.userId, 64)}`
  if (!u) throw new HttpError(404, 'User not found.')
  if (isAdmin(u.email)) throw new HttpError(400, 'Admins can’t be suspended.')
  await sql`update users set banned = ${banned} where id = ${u.id}`
  if (banned) await sql`delete from sessions where user_id = ${u.id}`
  await logEvent(sql, u.id, banned ? 'banned' : 'unbanned', '', adminId)
  return { ok: true }
}
