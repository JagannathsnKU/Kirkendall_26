import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  REWARDS,
  SEED_STUDENTS,
  SEED_UNIVERSITY_POINTS,
  SNAP_TTL_DAYS,
  UNIVERSITIES,
  actionById,
  dailyLimit,
  universityById,
  type Action,
  type Impact,
} from '../src/data.ts'
import type { Session, SnapDetail, SnapResult, StudentRow, SubmitOutcome, UniversityRow, User } from '../src/model.ts'
import { emptyStreak, recordDay } from '../src/streak.ts'
import * as admin from './admin.ts'
import { checkPassword, endSession, hashPassword, isAdmin, notAdmin, requireUser, startSession } from './auth.ts'
import { db, dbConfigured, type Sql } from './db.ts'
import { HttpError, readJson, send, str } from './http.ts'
import { logEvent, logSuspicious, removeMedia } from './moderation.ts'
import { createPost, deletePost, listPosts, mediaToken, report, vote } from './spotlight.ts'
import { ANTI_CHEAT, OTHER_ID, verifyPhoto } from './verify.ts'

const RATE_LIMIT = 20
/** Someone hammering the rate limit is logged once per this window, not on every blocked request. */
const RATE_LIMIT_LOG_MS = 10 * 60 * 1000
const DUPLICATE_DISTANCE = 6
const RECENT_HASHES = 500
const RECENT_SNAPS = 20
const MAX_FRAMES = 6
const MAX_PHOTO_CHARS = 160_000
const SNAP_TTL_MS = SNAP_TTL_DAYS * 24 * 60 * 60 * 1000
const CLEANUP_EVERY_MS = 10 * 60 * 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  universityId: r.university_id,
  points: r.points,
  impact: { co2: r.co2, kwh: r.kwh, water: r.water, plastic: r.plastic },
  streak: JSON.parse(r.streak),
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
  const [{ email }] = await sql<{ email: string }[]>`select email from users where id = ${userId}`
  if (isAdmin(email)) throw new HttpError(403, 'Admin accounts don’t log snaps.')

  const day = today(req)
  const limit = dailyLimit(actionId)
  const limitHit: SubmitOutcome = {
    ok: false,
    kind: 'limit',
    message: `This counts ${limit === 1 ? 'once' : `${limit} times`} a day. Come back tomorrow!`,
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

    const [used] = await sql<{ n: number }[]>`
      select count(*)::int as n from snaps where user_id = ${userId} and action_id = ${actionId} and day = ${day}`
    if (used.n >= limit) return limitHit
    if (hash) {
      const seen = await sql<{ hash: string }[]>`
        select hash from photo_hashes where user_id = ${userId} order by ts desc limit ${RECENT_HASHES}`
      if (seen.some((s) => hammingDistance(s.hash, hash) <= DUPLICATE_DISTANCE)) {
        await logSuspicious(sql, userId, 'duplicate', actionById(actionId)?.label ?? actionId)
        return { ok: false, kind: 'duplicate', message: 'This looks like a photo you already used. Snap a new one!' }
      }
    }
  }

  const verdict = await verifyPhoto(actionId, frames, description)
  const what = description ? `${actionId} "${description}"` : actionId
  console.log(`[verify] ${what} (${kind}, ${source}) → ${verdict.verified ? 'ok' : 'rejected'} (${verdict.confidence.toFixed(2)})`)
  if (!verdict.verified) {
    const claim = preset?.label ?? description ?? actionId
    if (verdict.suspicious) await logSuspicious(sql, userId, 'screen', `${claim}: ${verdict.reason}`)
    else await logEvent(sql, userId, 'rejected', `${claim}: ${verdict.reason}`)
    return { ok: false, kind: 'rejected', message: verdict.reason || 'We couldn’t see that action in this photo.' }
  }

  const action: Action | null = preset ?? (verdict.custom ? { id: OTHER_ID, ...verdict.custom } : null)
  if (!action) throw new HttpError(502, 'Couldn’t check your photo right now. Try again.')

  const award = await sql.begin(async (tx) => {
    const [u] = await tx<UserRow[]>`select * from users where id = ${userId} for update`
    if (ANTI_CHEAT) {
      // Checked again under the row lock so two photos sent at once can't both get past the limit.
      const [used] = await tx<{ n: number }[]>`
        select count(*)::int as n from snaps where user_id = ${userId} and action_id = ${actionId} and day = ${day}`
      if (used.n >= limit) return null
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
      insert into snaps (id, user_id, action_id, label, emoji, kind, points, day, ts, thumb, hash, photo, impact, headline, analogy, analogy_emoji)
      values (${snapId}, ${userId}, ${action.id}, ${action.label}, ${action.emoji}, ${kind}, ${action.points}, ${day}, ${now}, ${thumb}, ${hash},
        ${photo}, ${JSON.stringify(action.impact)}, ${action.headline}, ${action.analogy}, ${action.analogyEmoji})`
    if (hash) {
      await tx`
        insert into photo_hashes (user_id, hash, ts) values (${userId}, ${hash}, ${now})
        on conflict (user_id, hash) do update set ts = excluded.ts`
    }
    return { snapId, before: u.points, total, streak: update, universityId: u.university_id }
  })
  if (!award) return limitHit

  const result: SnapResult = {
    snapId: award.snapId,
    action,
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

async function snapDetail(req: IncomingMessage): Promise<SnapDetail> {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const id = str(new URL(req.url ?? '/', 'http://localhost').searchParams.get('id'), 64)
  const [s] = await sql`
    select s.action_id, s.photo, s.impact, s.headline, s.analogy, s.analogy_emoji,
      p.kind as post_kind, p.url, p.poster, p.score
    from snaps s left join posts p on p.snap_id = s.id
    where s.id = ${id} and s.user_id = ${userId}`
  if (!s) throw new HttpError(404, 'This snap has expired.')
  // Snaps from before impact was stored fall back to the action's standard card.
  const preset = actionById(s.action_id)
  return {
    photo: s.photo,
    impact: s.impact ? (JSON.parse(s.impact) as Impact) : (preset?.impact ?? null),
    headline: s.headline ?? preset?.headline ?? null,
    analogy: s.analogy ?? preset?.analogy ?? null,
    analogyEmoji: s.analogy_emoji ?? preset?.analogyEmoji ?? null,
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
  'GET /api/me': me,
  'PATCH /api/me': updateMe,
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

export async function handle(req: IncomingMessage, res: ServerResponse) {
  const origin = process.env.ALLOWED_ORIGIN
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Timezone')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    if (req.method === 'OPTIONS') return res.writeHead(204).end()
  }

  const path = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, '')
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
