import { randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  REWARDS,
  SEED_STUDENTS,
  SEED_UNIVERSITY_POINTS,
  SNAP_TTL_DAYS,
  UNIVERSITIES,
  actionById,
  cooldownMinutes,
  dailyLimit,
  pointsFor,
  universityById,
  waitText,
  type Action,
  type Impact,
} from '../src/data.ts'
import { pickFact } from '../src/facts.ts'
import { avatarUrl, type Session, type SnapDetail, type SnapResult, type StudentRow, type SubmitOutcome, type UniversityRow, type User } from '../src/model.ts'
import { TRIP, checkTrip, milesText, summarize, tripHeadline, tripImpact, type TripMode, type TripPoint, type TripSummary } from '../src/route.ts'
import { emptyStreak, recordDay } from '../src/streak.ts'
import * as admin from './admin.ts'
import { checkPassword, endSession, hashPassword, hashToken, isAdmin, notAdmin, requireUser, startSession } from './auth.ts'
import { db, dbConfigured, type Query, type Sql } from './db.ts'
import { HttpError, readJson, send, str } from './http.ts'
import { appUrl, requireMail, sendMail } from './mail.ts'
import { logEvent, logSuspicious, removeMedia } from './moderation.ts'
import { createPost, deletePost, listPosts, mediaToken, report, servePostPhoto, vote } from './spotlight.ts'
import { ANTI_CHEAT, OTHER_ID, verifyPhoto } from './verify.ts'

const RATE_LIMIT = 20
/** Someone hammering the rate limit is logged once per this window, not on every blocked request. */
const RATE_LIMIT_LOG_MS = 10 * 60 * 1000
const DUPLICATE_DISTANCE = 6
/** The AI compares each new photo with this many of the student's latest snaps from this window. */
const COMPARE_LAST = 3
const COMPARE_WINDOW_MS = 24 * 60 * 60 * 1000
/** For "Other", the AI also checks the new claim against this many of the student's Other snaps from this window. */
const OTHER_HISTORY = 4
const OTHER_HISTORY_MS = 7 * 24 * 60 * 60 * 1000
const RECENT_HASHES = 500
const RECENT_SNAPS = 20
const MAX_FRAMES = 6
const MAX_PHOTO_CHARS = 160_000
const SNAP_TTL_MS = SNAP_TTL_DAYS * 24 * 60 * 60 * 1000
const CLEANUP_EVERY_MS = 10 * 60 * 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESET_TTL_MS = 60 * 60 * 1000
/** Reset emails one account can trigger per hour, so the form can't be used to spam someone. */
const RESETS_PER_HOUR = 3
const MAX_AVATAR_CHARS = 120_000
const JPEG = /^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+=*$/

interface UserRow {
  id: string
  email: string
  name: string
  university_id: string
  points: number
  co2: number
  kwh: number
  water: number
  plastic: number
  streak: string
  avatar_at: string
}
const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  universityId: r.university_id,
  points: r.points,
  impact: { co2: r.co2, kwh: r.kwh, water: r.water, plastic: r.plastic },
  streak: JSON.parse(r.streak),
  avatar: avatarUrl(r.id, r.avatar_at),
  admin: isAdmin(r.email),
})

/** The user's calendar day, so streaks and daily limits follow their phone's clock. */
function today(req: IncomingMessage) {
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  try {
    return format(str(req.headers['x-timezone'], 64) || 'UTC')
  } catch {
    return format('UTC')
  }
}

function hammingDistance(a: string, b: string) {
  let d = 0
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16)
    for (; x; x >>= 1) d += x & 1
  }
  return d
}

let lastCleanup = 0

/** Deletes week-old snaps and their Spotlight media. Runs at most every few minutes per server. */
async function cleanup(sql: Sql) {
  if (Date.now() - lastCleanup < CLEANUP_EVERY_MS) return
  lastCleanup = Date.now()
  const cutoff = Date.now() - SNAP_TTL_MS
  try {
    const media = await sql<{ url: string; poster: string | null }[]>`
      select p.url, p.poster from posts p join snaps s on s.id = p.snap_id where s.ts < ${cutoff}`
    await sql`delete from snaps where ts < ${cutoff}`
    await removeMedia(media.flatMap((m) => [m.url, m.poster]))
  } catch (e) {
    console.error('Cleanup failed', e)
  }
}

async function loadSession(sql: Sql, userId: string): Promise<Session> {
  await cleanup(sql)
  const [user] = await sql<UserRow[]>`select * from users where id = ${userId}`
  if (!user) throw new HttpError(401, 'Please log in again.')
  const snaps = await sql`
    select id, action_id, label, emoji, kind, ts, points, thumb from snaps
    where user_id = ${userId} order by ts desc limit ${RECENT_SNAPS}`
  const redemptions = await sql`select reward_id, code, ts from redemptions where user_id = ${userId} order by ts desc`
  return {
    user: toUser(user),
    snaps: snaps.map((s) => ({
      id: s.id,
      actionId: s.action_id,
      label: s.label,
      emoji: s.emoji,
      kind: s.kind,
      ts: Number(s.ts),
      points: s.points,
      thumb: s.thumb,
    })),
    redemptions: redemptions.map((r) => ({ rewardId: r.reward_id, code: r.code, ts: Number(r.ts) })),
  }
}

function profile(body: Record<string, unknown>) {
  const name = str(body.name, 24)
  const universityId = str(body.universityId, 32)
  if (!name) throw new HttpError(400, 'Add your name.')
  if (!UNIVERSITIES.some((u) => u.id === universityId)) throw new HttpError(400, 'Pick your university.')
  return { name, universityId }
}

/** Ties go to the real student, matching the board's sort order. */
async function studentRank(sql: Sql, universityId: string, userId: string, points: number) {
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from users
    where university_id = ${universityId} and id <> ${userId} and points > ${points} and not banned and ${notAdmin(sql)}`
  return 1 + n + SEED_STUDENTS.filter((s) => s.points > points).length
}

async function schools(sql: Sql, universityId: string): Promise<UniversityRow[]> {
  const totals = await sql<{ university_id: string; points: number }[]>`
    select university_id, sum(points)::int as points from users where not banned and ${notAdmin(sql)} group by university_id`
  return UNIVERSITIES.map((u) => ({
    ...u,
    points: SEED_UNIVERSITY_POINTS[u.id] + (totals.find((t) => t.university_id === u.id)?.points ?? 0),
    me: u.id === universityId,
  })).sort((a, b) => b.points - a.points)
}

async function signup(req: IncomingMessage) {
  const body = await readJson(req)
  const { name, universityId } = profile(body)
  const email = str(body.email, 254).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email.')
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Use at least 8 characters for your password.')

  const sql = await db()
  const id = randomUUID()
  try {
    await sql`
      insert into users (id, email, password, name, university_id, streak)
      values (${id}, ${email}, ${await hashPassword(password)}, ${name}, ${universityId}, ${JSON.stringify(emptyStreak())})`
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'That email already has an account. Log in instead.')
    throw e
  }
  return { token: await startSession(sql, id), session: await loadSession(sql, id) }
}

async function login(req: IncomingMessage) {
  const body = await readJson(req)
  const email = str(body.email, 254).toLowerCase()
  const password = typeof body.password === 'string' ? body.password : ''
  const sql = await db()
  const [row] = await sql<{ id: string; password: string; banned: boolean }[]>`select id, password, banned from users where email = ${email}`
  if (!(await checkPassword(password, row?.password ?? null))) throw new HttpError(401, 'Wrong email or password.')
  if (row.banned) throw new HttpError(403, 'This account is suspended.')
  return { token: await startSession(sql, row.id), session: await loadSession(sql, row.id) }
}

/** Always answers the same way, so the form can't be used to find out who has an account. */
async function forgotPassword(req: IncomingMessage) {
  const email = str((await readJson(req)).email, 254).toLowerCase()
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email.')
  requireMail()
  const base = appUrl(req)
  const sql = await db()
  const [user] = await sql<{ id: string; name: string; banned: boolean }[]>`select id, name, banned from users where email = ${email}`
  if (!user || user.banned) return { ok: true }

  const now = Date.now()
  await sql`delete from password_resets where expires < ${now}`
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from password_resets where user_id = ${user.id} and ts > ${now - RESET_TTL_MS}`
  if (n >= RESETS_PER_HOUR) return { ok: true }

  const token = randomBytes(32).toString('base64url')
  await sql`insert into password_resets (token, user_id, expires, ts) values (${hashToken(token)}, ${user.id}, ${now + RESET_TTL_MS}, ${now})`
  const link = `${base}/#/reset?token=${token}`
  const text = `Hi ${user.name},\n\nTap this link to choose a new EcoU password. It works once and expires in an hour.\n\n${link}\n\nIf you didn't ask for this, ignore this email and your password stays the same.`
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#0c0d0c">
  <p style="font-size:20px;font-weight:700;margin:0 0 16px">Reset your EcoU password</p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">Hi ${escapeHtml(user.name)}, tap the button to choose a new password. The link works once and expires in an hour.</p>
  <a href="${link}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#0c0d0c;color:#fff;font-weight:600;text-decoration:none">Choose a new password</a>
  <p style="font-size:13px;line-height:1.5;color:#525855;margin:20px 0 0">If you didn’t ask for this, ignore this email and your password stays the same.</p>
</div>`
  try {
    await sendMail(email, 'Reset your EcoU password', text, html)
  } catch (e) {
    console.error('Reset email failed', e)
    throw new HttpError(502, 'Couldn’t send the email right now. Try again in a minute.')
  }
  return { ok: true }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Sets the new password, signs out every other device, and logs this one in. */
async function resetPassword(req: IncomingMessage) {
  const body = await readJson(req)
  const token = str(body.token, 100)
  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Use at least 8 characters for your password.')
  const hashed = await hashPassword(password)
  const sql = await db()
  const userId = await sql.begin(async (tx) => {
    const [row] = await tx<{ user_id: string; expires: string }[]>`
      delete from password_resets where token = ${hashToken(token)} returning user_id, expires`
    if (!row || Number(row.expires) < Date.now()) return null
    await tx`update users set password = ${hashed} where id = ${row.user_id}`
    await tx`delete from sessions where user_id = ${row.user_id}`
    await tx`delete from password_resets where user_id = ${row.user_id}`
    return row.user_id
  })
  if (!userId) throw new HttpError(400, 'This reset link has expired or was already used. Request a new one.')
  const [user] = await sql<{ banned: boolean }[]>`select banned from users where id = ${userId}`
  if (user.banned) throw new HttpError(403, 'This account is suspended.')
  return { token: await startSession(sql, userId), session: await loadSession(sql, userId) }
}

async function logout(req: IncomingMessage) {
  await endSession(await db(), req)
  return { ok: true }
}

async function me(req: IncomingMessage) {
  const sql = await db()
  return loadSession(sql, await requireUser(sql, req))
}

async function updateMe(req: IncomingMessage) {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const { name, universityId } = profile(await readJson(req))
  await sql`update users set name = ${name}, university_id = ${universityId} where id = ${userId}`
  return loadSession(sql, userId)
}

/** A square JPEG the phone already shrank, or '' to remove the picture. */
async function updateAvatar(req: IncomingMessage) {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const image = (await readJson(req)).image
  if (image !== '' && (typeof image !== 'string' || image.length > MAX_AVATAR_CHARS || !JPEG.test(image))) {
    throw new HttpError(400, 'That picture didn’t work. Try another one.')
  }
  await sql`update users set avatar = ${image}, avatar_at = ${image ? Date.now() : 0} where id = ${userId}`
  return loadSession(sql, userId)
}

/** Served as an image so <img> tags can load it without a login token. */
async function serveAvatar(req: IncomingMessage, res: ServerResponse) {
  const id = str(new URL(req.url ?? '/', 'http://localhost').searchParams.get('u'), 64)
  const [row] = id ? await (await db())<{ avatar: string }[]>`select avatar from users where id = ${id} and not banned` : []
  if (!row?.avatar) return res.writeHead(404, { 'Cache-Control': 'no-store' }).end()
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(Buffer.from(row.avatar.slice(row.avatar.indexOf(',') + 1), 'base64'))
}

async function snap(req: IncomingMessage): Promise<SubmitOutcome> {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const body = await readJson(req)
  const actionId = str(body.actionId, 32)
  const kind = body.kind === 'video' ? 'video' : 'photo'
  const frames = (Array.isArray(body.frames) ? body.frames : [])
    .filter((f): f is string => typeof f === 'string' && f.length > 0 && f.length < 600_000)
    .slice(0, MAX_FRAMES)
  const thumb = typeof body.thumb === 'string' && body.thumb.startsWith('data:image/jpeg;base64,') ? body.thumb.slice(0, 80_000) : ''
  const photo =
    typeof body.photo === 'string' && body.photo.startsWith('data:image/jpeg;base64,') && body.photo.length <= MAX_PHOTO_CHARS ? body.photo : ''
  const hash = typeof body.hash === 'string' && /^[0-9a-f]{16}$/.test(body.hash) ? body.hash : ''
  const source = body.source === 'upload' ? 'upload' : 'camera'
  const description = typeof body.description === 'string' ? body.description.replace(/[\r\n<>]+/g, ' ').trim().slice(0, 80) : undefined
  const preset = actionById(actionId)
  if (!preset && actionId !== OTHER_ID) throw new HttpError(400, 'Unknown action.')
  if (!frames.length || !thumb) throw new HttpError(400, 'Missing photo.')
  const trip = tripFrom(body.trip, actionId)
  const [{ email }] = await sql<{ email: string }[]>`select email from users where id = ${userId}`
  if (isAdmin(email)) throw new HttpError(403, 'Admin accounts don’t log snaps.')

  const day = today(req)
  const limit = dailyLimit(actionId)
  const cooldownMs = cooldownMinutes(actionId) * 60_000
  /** The daily limit or cooldown that stops this snap from counting, if any. */
  const blocked = async (q: Query): Promise<SubmitOutcome | null> => {
    const [u] = await q<{ n: number; last: string | null }[]>`
      select count(*) filter (where day = ${day})::int as n, max(ts) as last
      from snaps where user_id = ${userId} and action_id = ${actionId}`
    if (u.n >= limit) {
      return { ok: false, kind: 'limit', message: `This counts ${limit === 1 ? 'once' : `${limit} times`} a day. Come back tomorrow!` }
    }
    const wait = u.last === null ? 0 : Number(u.last) + cooldownMs - Date.now()
    return wait > 0 ? { ok: false, kind: 'limit', message: `You just logged this. It counts again in ${waitText(wait)}.` } : null
  }

  if (ANTI_CHEAT) {
    const now = Date.now()
    await sql`delete from attempts where user_id = ${userId} and ts < ${now - 3_600_000}`
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from attempts where user_id = ${userId} and ts > ${now - 60_000}`
    if (n >= RATE_LIMIT) {
      const [recent] = await sql`
        select 1 from events where user_id = ${userId} and kind = 'rate_limit' and ts > ${now - RATE_LIMIT_LOG_MS} limit 1`
      if (!recent) await logSuspicious(sql, userId, 'rate_limit', `${n} snaps in a minute`)
      throw new HttpError(429, 'Too many photos at once. Take a breather.')
    }
    await sql`insert into attempts (user_id, ts) values (${userId}, ${now})`

    const block = await blocked(sql)
    if (block) return block
    if (hash) {
      const seen = await sql<{ hash: string }[]>`
        select hash from photo_hashes where user_id = ${userId} order by ts desc limit ${RECENT_HASHES}`
      if (seen.some((s) => hammingDistance(s.hash, hash) <= DUPLICATE_DISTANCE)) {
        await logSuspicious(sql, userId, 'duplicate', actionById(actionId)?.label ?? actionId)
        return { ok: false, kind: 'duplicate', message: 'This looks like a photo you already used. Snap a new one!' }
      }
    }
  }

  if (trip) {
    const claim = `${preset!.label}, ${milesText(trip.summary.miles)} in ${Math.round(trip.summary.minutes)} min`
    const problem = checkTrip(trip.mode, trip.summary)
    if (problem) {
      const detail = `${claim} (${trip.summary.fastMph} mph): ${problem.reason}`
      if (problem.suspicious) await logSuspicious(sql, userId, 'trip', detail)
      else await logEvent(sql, userId, 'rejected', detail)
      return { ok: false, kind: 'rejected', message: problem.reason }
    }
    const [overlap] = await sql`
      select 1 from snaps where user_id = ${userId} and trip_end > ${trip.summary.start} and trip_start < ${trip.summary.end} limit 1`
    if (overlap) {
      await logSuspicious(sql, userId, 'duplicate', `${claim}: overlaps a trip already logged`)
      return { ok: false, kind: 'duplicate', message: 'You already logged this trip.' }
    }
  }

  type Earlier = { id: string; photo: string; thumb: string; label: string }
  const recent = ANTI_CHEAT
    ? await sql<Earlier[]>`
        select id, photo, thumb, label from snaps where user_id = ${userId} and ts > ${Date.now() - COMPARE_WINDOW_MS}
        order by ts desc limit ${COMPARE_LAST}`
    : []
  // "Other" has no cooldown, so the AI also sees the student's recent Other snaps to catch the same claim resubmitted.
  const pastOther =
    ANTI_CHEAT && actionId === OTHER_ID
      ? await sql<Earlier[]>`
          select id, photo, thumb, label from snaps where user_id = ${userId} and action_id = ${OTHER_ID}
            and ts > ${Date.now() - OTHER_HISTORY_MS}
          order by ts desc limit ${OTHER_HISTORY}`
      : []
  const earlier = [...recent, ...pastOther.filter((p) => !recent.some((r) => r.id === p.id))]
    .map((s) => (s.photo || s.thumb).replace(/^data:image\/jpeg;base64,/, ''))
    .filter(Boolean)

  const verdict = await verifyPhoto(actionId, frames, description, earlier, pastOther.map((p) => p.label))
  const what = description ? `${actionId} "${description}"` : actionId
  const outcome = verdict.verified ? 'ok' : verdict.duplicate ? 'duplicate' : 'rejected'
  console.log(`[verify] ${what} (${kind}, ${source}) → ${outcome} (${verdict.confidence.toFixed(2)})`)
  if (verdict.duplicate) {
    const claim = preset?.label ?? description ?? actionId
    const repeat = verdict.repeat
    await logSuspicious(sql, userId, 'duplicate', `${claim}: ${repeat ? 'same action as one already logged' : 'same scene as a recent snap'}`, verdict.ai)
    return {
      ok: false,
      kind: 'duplicate',
      message: repeat
        ? 'You already logged this one. Snap a different action!'
        : 'This looks like the same scene as a recent snap. Snap a new action!',
    }
  }
  if (!verdict.verified) {
    const claim = preset?.label ?? description ?? actionId
    if (verdict.suspicious) await logSuspicious(sql, userId, 'screen', `${claim}: ${verdict.reason}`, verdict.ai)
    else await logEvent(sql, userId, 'rejected', `${claim}: ${verdict.reason}`, null, verdict.ai)
    return { ok: false, kind: 'rejected', message: verdict.reason || 'We couldn’t see that action in this photo.' }
  }

  let action: Action | null = preset ?? (verdict.custom ? { id: OTHER_ID, ...verdict.custom } : null)
  if (!action) throw new HttpError(502, 'Couldn’t check your photo right now. Try again.')
  if (trip) {
    const impact = tripImpact(trip.mode, trip.summary.miles)
    action = { ...action, impact, points: pointsFor(impact), headline: tripHeadline(trip.mode, trip.summary) }
  }
  const fact = pickFact(action.impact)
  const tripCard = trip && { miles: trip.summary.miles, minutes: trip.summary.minutes, avgMph: trip.summary.avgMph }

  const award = await sql.begin(async (tx) => {
    const [u] = await tx<UserRow[]>`select * from users where id = ${userId} for update`
    if (ANTI_CHEAT) {
      // Checked again under the row lock so two photos sent at once can't both get past the limit.
      const block = await blocked(tx)
      if (block) return { block }
    }
    const streak = JSON.parse(u.streak)
    const update = recordDay(streak, day)
    const total = u.points + action.points + update.bonus
    await tx`
      update users set
        points = ${total},
        co2 = ${+(u.co2 + action.impact.co2).toFixed(2)},
        kwh = ${+(u.kwh + action.impact.kwh).toFixed(2)},
        water = ${u.water + action.impact.water},
        plastic = ${u.plastic + action.impact.plastic},
        streak = ${JSON.stringify(streak)}
      where id = ${userId}`
    const snapId = randomUUID()
    const now = Date.now()
    await tx`
      insert into snaps (id, user_id, action_id, label, emoji, kind, points, day, ts, thumb, hash, photo, impact, headline, analogy, analogy_emoji,
        trip_start, trip_end, trip, ai)
      values (${snapId}, ${userId}, ${action.id}, ${action.label}, ${action.emoji}, ${kind}, ${action.points}, ${day}, ${now}, ${thumb}, ${hash},
        ${photo}, ${JSON.stringify(action.impact)}, ${action.headline}, ${fact.text}, ${fact.emoji},
        ${trip?.summary.start ?? null}, ${trip?.summary.end ?? null}, ${tripCard ? JSON.stringify(tripCard) : null},
        ${JSON.stringify(verdict.ai).slice(0, 8000)})`
    if (hash) {
      await tx`
        insert into photo_hashes (user_id, hash, ts) values (${userId}, ${hash}, ${now})
        on conflict (user_id, hash) do update set ts = excluded.ts`
    }
    return { snapId, before: u.points, total, streak: update, universityId: u.university_id }
  })
  if (award.block) return award.block

  const result: SnapResult = {
    snapId: award.snapId,
    action,
    fact,
    thumb,
    points: action.points,
    total: award.total,
    rankBefore: await studentRank(sql, award.universityId, userId, award.before),
    rankAfter: await studentRank(sql, award.universityId, userId, award.total),
    universityRank: (await schools(sql, award.universityId)).findIndex((s) => s.me) + 1,
    streak: award.streak,
  }
  return { ok: true, result }
}

/** A GPS trip sent with a walk or transit snap, or null if there isn't one. */
function tripFrom(raw: unknown, actionId: string): { mode: TripMode; summary: TripSummary } | null {
  if (raw == null) return null
  const t = raw as { mode?: unknown; points?: unknown }
  if ((t.mode !== 'walk' && t.mode !== 'bus') || t.mode !== actionId) throw new HttpError(400, 'This trip doesn’t match the action.')
  if (!Array.isArray(t.points)) throw new HttpError(400, 'Invalid trip.')
  const points = t.points.slice(0, TRIP.MAX_POINTS).filter(
    (p): p is TripPoint =>
      Array.isArray(p) && p.length === 4 && p.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
      Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p[3] >= 0,
  )
  return { mode: t.mode, summary: summarize(points) }
}

async function snapDetail(req: IncomingMessage): Promise<SnapDetail> {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const id = str(new URL(req.url ?? '/', 'http://localhost').searchParams.get('id'), 64)
  const [s] = await sql`
    select s.action_id, s.photo, s.impact, s.headline, s.analogy, s.analogy_emoji, s.trip,
      p.kind as post_kind, p.url, p.poster, p.score
    from snaps s left join posts p on p.snap_id = s.id
    where s.id = ${id} and s.user_id = ${userId}`
  if (!s) throw new HttpError(404, 'This snap has expired.')
  // Snaps from before impact was stored fall back to the action's standard card.
  const preset = actionById(s.action_id)
  const impact: Impact | null = s.impact ? JSON.parse(s.impact) : (preset?.impact ?? null)
  const fact = s.analogy ? { text: s.analogy, emoji: s.analogy_emoji } : impact && pickFact(impact)
  return {
    photo: s.photo,
    impact,
    headline: s.headline ?? preset?.headline ?? null,
    analogy: fact?.text ?? null,
    analogyEmoji: fact?.emoji ?? null,
    trip: s.trip ? JSON.parse(s.trip) : null,
    post: s.url ? { kind: s.post_kind, url: s.url, poster: s.poster, score: s.score } : null,
  }
}

async function studentBoard(req: IncomingMessage): Promise<StudentRow[]> {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const [me] = await sql<UserRow[]>`select * from users where id = ${userId}`
  const real = await sql<{ id: string; name: string; points: number }[]>`
    select id, name, points from users
    where university_id = ${me.university_id} and not banned and ${notAdmin(sql)} order by points desc, created_at limit 100`
  const rows = [...real.map((r) => ({ ...r, me: r.id === userId })), ...SEED_STUDENTS.map((s) => ({ ...s, me: false }))]
  if (!rows.some((r) => r.me)) rows.push({ id: me.id, name: me.name, points: me.points, me: true })
  return rows.sort((a, b) => b.points - a.points || Number(b.me) - Number(a.me))
}

async function schoolBoard(req: IncomingMessage): Promise<UniversityRow[]> {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const [me] = await sql<{ university_id: string }[]>`select university_id from users where id = ${userId}`
  return schools(sql, me.university_id)
}

async function redeem(req: IncomingMessage) {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const rewardId = str((await readJson(req)).rewardId, 32)
  const reward = REWARDS.find((r) => r.id === rewardId)
  if (!reward) throw new HttpError(400, 'Unknown reward.')
  const [u] = await sql<{ points: number; university_id: string }[]>`select points, university_id from users where id = ${userId}`
  if (u.points < reward.points) throw new HttpError(400, 'Not enough points yet.')

  const school = universityById(u.university_id).short.replace(/\W/g, '').slice(0, 4).toUpperCase()
  const code = `ECOU-${school}-${Math.floor(1000 + Math.random() * 9000)}`
  await sql`
    insert into redemptions (user_id, reward_id, code, ts) values (${userId}, ${reward.id}, ${code}, ${Date.now()})
    on conflict (user_id, reward_id) do nothing`
  const [r] = await sql`select reward_id, code, ts from redemptions where user_id = ${userId} and reward_id = ${reward.id}`
  return { rewardId: r.reward_id, code: r.code, ts: Number(r.ts) }
}

function health() {
  const mode = process.env.VERIFY_MOCK === '1' ? 'mock' : process.env.GEMINI_API_KEY ? 'gemini' : 'unconfigured'
  return Promise.resolve({ ok: true, mode, antiCheat: ANTI_CHEAT, database: dbConfigured, sharing: !!process.env.BLOB_READ_WRITE_TOKEN })
}

const ROUTES: Record<string, (req: IncomingMessage) => Promise<unknown>> = {
  'GET /api/health': health,
  'POST /api/signup': signup,
  'POST /api/login': login,
  'POST /api/logout': logout,
  'POST /api/forgot': forgotPassword,
  'POST /api/reset': resetPassword,
  'GET /api/me': me,
  'PATCH /api/me': updateMe,
  'POST /api/avatar': updateAvatar,
  'POST /api/snap': snap,
  'GET /api/snap': snapDetail,
  'GET /api/leaderboard/students': studentBoard,
  'GET /api/leaderboard/schools': schoolBoard,
  'POST /api/redeem': redeem,
  'POST /api/media': mediaToken,
  'GET /api/posts': listPosts,
  'POST /api/posts': createPost,
  'POST /api/posts/delete': deletePost,
  'POST /api/vote': vote,
  'POST /api/report': report,
  'GET /api/admin/summary': admin.summary,
  'GET /api/admin/overview': admin.overview,
  'GET /api/admin/posts': admin.posts,
  'POST /api/admin/seen': admin.markSeen,
  'GET /api/admin/queue': admin.queue,
  'GET /api/admin/activity': admin.activity,
  'GET /api/admin/users': admin.users,
  'GET /api/admin/user': admin.user,
  'POST /api/admin/decide': admin.decide,
  'POST /api/admin/review': admin.rereview,
  'POST /api/admin/points': admin.takePoints,
  'POST /api/admin/revoke': admin.revoke,
  'POST /api/admin/takedown': admin.takedown,
  'POST /api/admin/flag': admin.flag,
  'POST /api/admin/ban': admin.ban,
}

/** GET routes that answer with an image instead of JSON. */
const IMAGES: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<unknown>> = {
  '/api/avatar': serveAvatar,
  '/api/post-photo': servePostPhoto,
}

export async function handle(req: IncomingMessage, res: ServerResponse) {
  const origin = process.env.ALLOWED_ORIGIN
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Timezone')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    if (req.method === 'OPTIONS') return res.writeHead(204).end()
  }

  const path = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '')
  const image = req.method === 'GET' && IMAGES[path]
  if (image) {
    return image(req, res).catch((e) => {
      console.error(e)
      if (!res.headersSent) res.writeHead(500).end()
    })
  }
  const route = ROUTES[`${req.method} ${path}`]
  if (!route) return send(res, 404, { error: 'Not found' })

  try {
    send(res, 200, await route(req))
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    if (status >= 500) console.error(e)
    send(res, status, { error: e instanceof HttpError ? e.message : 'Something went wrong. Try again.' })
  }
}
