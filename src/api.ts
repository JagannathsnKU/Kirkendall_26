/*
 * Client API. Every screen talks to the server through these async functions.
 * The server owns points, limits, and leaderboards; the phone keeps only a login
 * token and a copy of the last session so the app opens offline.
 */
import { ANTI_CHEAT } from './config'
import { OTHER, dailyLimit } from './data'
import {
  type AdminActivity,
  type AdminOverview,
  type AdminPost,
  type AdminSummary,
  type AdminUserDetail,
  type AdminUserRow,
  type FlagItem,
  type Post,
  type ReportReason,
  type Redemption,
  type Session,
  type Snap,
  type SnapDetail,
  type StudentRow,
  type SubmitOutcome,
  type UniversityRow,
} from './model'
import type { Photo } from './photo'

export type * from './model'

const TOKEN_KEY = 'ecou:token'
const SESSION_KEY = 'ecou:session'
const OFFLINE = 'You’re offline. Connect and try again.'

localStorage.removeItem('ecou:v1')

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let token = localStorage.getItem(TOKEN_KEY)

function remember(next: string | null, session: Session | null) {
  token = next
  if (next) localStorage.setItem(TOKEN_KEY, next)
  else localStorage.removeItem(TOKEN_KEY)
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(SESSION_KEY)
}

const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {})

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...authHeaders(),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, OFFLINE)
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && token) remember(null, null)
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong. Try again.')
  return data as T
}

const startOfDay = () => new Date().setHours(0, 0, 0, 0)

export const usedToday = (snaps: Snap[], actionId: string) =>
  snaps.filter((s) => s.actionId === actionId && s.ts >= startOfDay()).length

export const atDailyLimit = (snaps: Snap[], actionId: string) => ANTI_CHEAT && usedToday(snaps, actionId) >= dailyLimit(actionId)

/** Falls back to the last copy when offline or the server is down; null once logged out. */
export async function getSession(): Promise<Session | null> {
  if (!token) return null
  try {
    const session = await call<Session>('me')
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return session
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null
    const cached = localStorage.getItem(SESSION_KEY)
    return cached ? (JSON.parse(cached) as Session) : null
  }
}

export async function signUp(fields: { name: string; email: string; password: string; universityId: string }): Promise<Session> {
  const { token, session } = await call<{ token: string; session: Session }>('signup', 'POST', fields)
  remember(token, session)
  return session
}

export async function logIn(email: string, password: string): Promise<Session> {
  const { token, session } = await call<{ token: string; session: Session }>('login', 'POST', { email, password })
  remember(token, session)
  return session
}

export async function updateProfile(name: string, universityId: string): Promise<Session> {
  const session = await call<Session>('me', 'PATCH', { name, universityId })
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export async function signOut(): Promise<void> {
  await call('logout', 'POST').catch(() => {})
  remember(null, null)
}

/** `description` is only used for the Other category. */
export async function submitSnap(actionId: string, photo: Photo, description?: string): Promise<SubmitOutcome> {
  const isOther = actionId === OTHER.id
  if (isOther && (description ?? '').trim().length < 3) return { ok: false, kind: 'error', message: 'Tell us what you did.' }
  try {
    return await call<SubmitOutcome>('snap', 'POST', {
      actionId,
      kind: photo.kind,
      frames: photo.frames,
      thumb: photo.thumb,
      photo: photo.image,
      hash: photo.hash,
      source: photo.source,
      description: isOther ? description!.trim() : undefined,
    })
  } catch (e) {
    return { ok: false, kind: 'error', message: (e as Error).message }
  }
}

export const getSnapDetail = (snapId: string) => call<SnapDetail>(`snap?id=${encodeURIComponent(snapId)}`)

export const getStudentLeaderboard = () => call<StudentRow[]>('leaderboard/students')

export const getUniversityLeaderboard = () => call<UniversityRow[]>('leaderboard/schools')

export const redeemReward = (rewardId: string) => call<Redemption>('redeem', 'POST', { rewardId })

const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }

/** Uploads the media straight to storage, then posts it to the user's school Spotlight. */
export async function sharePost(userId: string, snapId: string, photo: Photo, onProgress?: (pct: number) => void) {
  const { upload } = await import('@vercel/blob/client')
  const put = async (name: string, body: Blob, contentType: string, progress?: (pct: number) => void) => {
    const blob = await upload(`spotlight/${userId}/${name}`, body, {
      access: 'public',
      handleUploadUrl: '/api/media',
      headers: authHeaders(),
      contentType,
      onUploadProgress: progress && ((e) => progress(e.percentage)),
    })
    return blob.url
  }
  const still = await (await fetch(photo.preview)).blob()
  let url: string
  let poster: string | null = null
  if (photo.kind === 'video' && photo.video) {
    const type = photo.video.type.split(';')[0] || 'video/mp4'
    const contentType = VIDEO_EXT[type] ? type : 'video/mp4'
    ;[url, poster] = await Promise.all([
      put(`${snapId}.${VIDEO_EXT[contentType]}`, photo.video, contentType, onProgress),
      put(`${snapId}-poster.jpg`, still, 'image/jpeg'),
    ])
  } else {
    url = await put(`${snapId}.jpg`, still, 'image/jpeg', onProgress)
  }
  await call('posts', 'POST', { snapId, url, poster })
}

export const getPosts = (sort: 'top' | 'new') => call<Post[]>(`posts?sort=${sort}`)

/** `hidden` means the vote sent the post to admin review. */
export const votePost = (postId: string, value: -1 | 0 | 1) =>
  call<{ score: number; myVote: -1 | 0 | 1; bonus: number; hidden: boolean }>('vote', 'POST', { postId, value })

export const deletePost = (postId: string) => call('posts/delete', 'POST', { postId })

export const reportPost = (postId: string, reason: ReportReason) => call('report', 'POST', { postId, reason })

/* Admin only. */

export const getAdminSummary = () => call<AdminSummary>('admin/summary')

export const markAdminSeen = () => call('admin/seen', 'POST')

export const getAdminOverview = () => call<AdminOverview>('admin/overview')

export const getAdminPosts = () => call<AdminPost[]>('admin/posts')

export const getAdminQueue = () => call<FlagItem[]>('admin/queue')

export const getAdminActivity = () => call<AdminActivity>('admin/activity')

export const getAdminUsers = (q: string) => call<AdminUserRow[]>(`admin/users?q=${encodeURIComponent(q)}`)

export const getAdminUser = (id: string) => call<AdminUserDetail>(`admin/user?id=${encodeURIComponent(id)}`)

export const decideFlag = (flagId: string, decision: 'keep' | 'remove' | 'dismiss', revoke = false) =>
  call('admin/decide', 'POST', { flagId, decision, revoke })

export const reviewFlag = (flagId: string) => call('admin/review', 'POST', { flagId })

export const takePoints = (userId: string, amount: number, reason: string) => call('admin/points', 'POST', { userId, amount, reason })

export const revokeSnap = (snapId: string) => call('admin/revoke', 'POST', { snapId })

export const takeDownPost = (postId: string, revoke = false) => call('admin/takedown', 'POST', { postId, revoke })

export const flagUser = (userId: string, note: string) => call('admin/flag', 'POST', { userId, note })

export const setSuspended = (userId: string, banned: boolean) => call('admin/ban', 'POST', { userId, banned })
