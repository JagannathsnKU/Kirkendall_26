/*
 * Spotlight: snaps students choose to share with their school. Classmates vote,
 * and every UPVOTE_STEP net upvotes pays the poster bonus points.
 * Media goes straight from the phone to Vercel Blob; this server only signs
 * the upload and records the resulting URL.
 */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { REPORT_REASONS, avatarUrl, spotlightBonus, type Post } from '../src/model.ts'
import { requireUser } from './auth.ts'
import { db } from './db.ts'
import { HttpError, readJson, str } from './http.ts'
import { FLAG_AT, REPORT_HIDE_AT, flagPost, logEvent, removeMedia, reviewFlag } from './moderation.ts'

const MAX_MEDIA_BYTES = 60 * 1024 * 1024
const MEDIA_TYPES = ['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm']
const SHARE_WINDOW_MS = 60 * 60 * 1000
const TOP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const FEED_SIZE = 50

const folder = (userId: string) => `spotlight/${userId}/`

function requireStorage() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, 'Sharing isn’t set up yet.')
}

/** Only accept files this user uploaded to our Blob store. */
function ownMediaUrl(value: unknown, userId: string) {
  try {
    const url = new URL(str(value, 500))
    if (url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com') && url.pathname.startsWith(`/${folder(userId)}`)) {
      return url.toString()
    }
  } catch {}
  return null
}

/** Signs a direct phone-to-storage upload into the user's own folder. */
export async function mediaToken(req: IncomingMessage) {
  requireStorage()
  const sql = await db()
  const userId = await requireUser(sql, req)
  const body = (await readJson(req)) as unknown as HandleUploadBody
  if (body?.type !== 'blob.generate-client-token') throw new HttpError(400, 'Invalid request.')
  return handleUpload({
    request: req,
    body,
    onBeforeGenerateToken: async (pathname) => {
      if (!pathname.startsWith(folder(userId))) throw new HttpError(403, 'Not allowed.')
      return { allowedContentTypes: MEDIA_TYPES, maximumSizeInBytes: MAX_MEDIA_BYTES, addRandomSuffix: true }
    },
  })
}

export async function createPost(req: IncomingMessage) {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const body = await readJson(req)
  const url = ownMediaUrl(body.url, userId)
  const poster = body.poster ? ownMediaUrl(body.poster, userId) : null
  if (!url) throw new HttpError(400, 'Invalid media.')

  const [snap] = await sql<{ id: string; kind: string; label: string; emoji: string; ts: string }[]>`
    select id, kind, label, emoji, ts from snaps where id = ${str(body.snapId, 64)} and user_id = ${userId}`
  if (!snap) throw new HttpError(404, 'That snap wasn’t found.')
  if (Date.now() - Number(snap.ts) > SHARE_WINDOW_MS) throw new HttpError(400, 'Share snaps right after you take them.')

  const [user] = await sql<{ university_id: string }[]>`select university_id from users where id = ${userId}`
  await sql`
    insert into posts (id, snap_id, user_id, university_id, kind, url, poster, label, emoji, ts)
    values (${randomUUID()}, ${snap.id}, ${userId}, ${user.university_id}, ${snap.kind}, ${url}, ${poster}, ${snap.label}, ${snap.emoji}, ${Date.now()})
    on conflict (snap_id) do nothing`
  return { ok: true }
}

export async function listPosts(req: IncomingMessage): Promise<Post[]> {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const top = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sort') !== 'new'
  const [me] = await sql<{ university_id: string }[]>`select university_id from users where id = ${userId}`
  const rows = await sql`
    select p.id, p.user_id, p.kind, p.url, p.poster, p.label, p.emoji, p.score, p.bonus, p.ts, u.name, u.avatar_at,
      coalesce(v.value, 0)::int as my_vote,
      exists (select 1 from reports r where r.post_id = p.id and r.user_id = ${userId}) as reported
    from posts p
    join users u on u.id = p.user_id
    left join votes v on v.post_id = p.id and v.user_id = ${userId}
    where p.university_id = ${me.university_id} and not p.hidden and not u.banned
      ${top ? sql`and p.ts > ${Date.now() - TOP_WINDOW_MS}` : sql``}
    ${top ? sql`order by p.score desc, p.ts desc` : sql`order by p.ts desc`}
    limit ${FEED_SIZE}`
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatar: avatarUrl(r.user_id, r.avatar_at),
    label: r.label,
    emoji: r.emoji,
    kind: r.kind,
    url: r.url,
    poster: r.poster,
    score: r.score,
    myVote: r.my_vote,
    mine: r.user_id === userId,
    reported: r.reported,
    bonus: r.bonus,
    ts: Number(r.ts),
  }))
}

export async function vote(req: IncomingMessage) {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const body = await readJson(req)
  const postId = str(body.postId, 64)
  const value = body.value === 1 || body.value === -1 ? body.value : 0

  const result = await sql.begin(async (tx) => {
    const [post] = await tx<{ user_id: string; university_id: string; bonus: number; label: string; reviewed: boolean }[]>`
      select user_id, university_id, bonus, label, reviewed from posts where id = ${postId} for update`
    if (!post) throw new HttpError(404, 'That post is gone.')
    if (post.user_id === userId) throw new HttpError(400, 'You can’t vote on your own post.')
    const [me] = await tx<{ university_id: string }[]>`select university_id from users where id = ${userId}`
    if (me.university_id !== post.university_id) throw new HttpError(403, 'You can only vote on your school’s posts.')

    if (value === 0) await tx`delete from votes where post_id = ${postId} and user_id = ${userId}`
    else
      await tx`
        insert into votes (post_id, user_id, value) values (${postId}, ${userId}, ${value})
        on conflict (post_id, user_id) do update set value = excluded.value`

    const [{ score }] = await tx<{ score: number }[]>`select coalesce(sum(value), 0)::int as score from votes where post_id = ${postId}`
    const bonus = Math.max(post.bonus, spotlightBonus(score))
    if (bonus > post.bonus) await tx`update users set points = points + ${bonus - post.bonus} where id = ${post.user_id}`
    await tx`update posts set score = ${score}, bonus = ${bonus} where id = ${postId}`

    // Admin-approved posts can't be voted back into review.
    const flagId = score <= FLAG_AT && !post.reviewed ? await flagPost(tx, postId, post.user_id, 'downvotes') : null
    if (flagId) {
      await tx`update posts set hidden = true where id = ${postId}`
      await logEvent(tx, post.user_id, 'downvoted', `${post.label} (score ${score})`)
    }
    return { score, myVote: value, bonus, hidden: !!flagId, flagId }
  })

  if (result.flagId) await reviewFlag(sql, result.flagId)
  const [post] = await sql<{ hidden: boolean }[]>`select hidden from posts where id = ${postId}`
  return { score: result.score, myVote: result.myVote, bonus: result.bonus, hidden: post?.hidden ?? true }
}

export async function report(req: IncomingMessage) {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const body = await readJson(req)
  const postId = str(body.postId, 64)
  const reason = REPORT_REASONS.find((r) => r.id === body.reason)?.id
  if (!reason) throw new HttpError(400, 'Pick a reason.')

  const flagId = await sql.begin(async (tx) => {
    const [post] = await tx<{ user_id: string; university_id: string; label: string; reviewed: boolean }[]>`
      select user_id, university_id, label, reviewed from posts where id = ${postId} for update`
    if (!post) throw new HttpError(404, 'That post is gone.')
    if (post.user_id === userId) throw new HttpError(400, 'You can’t report your own post.')
    const [me] = await tx<{ university_id: string }[]>`select university_id from users where id = ${userId}`
    if (me.university_id !== post.university_id) throw new HttpError(403, 'You can only report your school’s posts.')

    const added = await tx`
      insert into reports (post_id, user_id, reason, ts) values (${postId}, ${userId}, ${reason}, ${Date.now()})
      on conflict (post_id, user_id) do nothing returning post_id`
    if (!added.length) return null
    await logEvent(tx, post.user_id, 'reported', `${post.label}: ${reason}`, userId)

    const newFlag = await flagPost(tx, postId, post.user_id, 'reports')
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from reports where post_id = ${postId}`
    const [{ ai }] = await tx<{ ai: string | null }[]>`
      select ai_verdict as ai from flags where post_id = ${postId} and status = 'open'`
    // Once the AI has cleared a post, it stays up until an admin decides.
    if (n >= REPORT_HIDE_AT && !post.reviewed && ai !== 'ok') await tx`update posts set hidden = true where id = ${postId}`
    return newFlag
  })

  if (flagId) await reviewFlag(sql, flagId)
  return { ok: true }
}

export async function deletePost(req: IncomingMessage) {
  const sql = await db()
  const userId = await requireUser(sql, req)
  const postId = str((await readJson(req)).postId, 64)
  const [post] = await sql<{ url: string; poster: string | null }[]>`
    delete from posts where id = ${postId} and user_id = ${userId} returning url, poster`
  if (!post) throw new HttpError(404, 'That post is gone.')
  await removeMedia([post.url, post.poster])
  return { ok: true }
}
