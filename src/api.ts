/*
 * Client API. Every screen talks to the server through these async functions.
 * The server owns points, limits, and leaderboards; the phone keeps only a login
 * token and a copy of the last session so the app opens offline.
 */
import { ANTI_CHEAT } from './config'
import { OTHER } from './data'
import { DAILY_LIMIT, type Redemption, type Session, type Snap, type StudentRow, type SubmitOutcome, type UniversityRow } from './model'
import type { Photo } from './photo'

export type * from './model'
export { DAILY_LIMIT }

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

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export const atDailyLimit = (snaps: Snap[], actionId: string) => ANTI_CHEAT && usedToday(snaps, actionId) >= DAILY_LIMIT

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
      image: photo.upload,
      thumb: photo.thumb,
      hash: photo.hash,
      source: photo.source,
      description: isOther ? description!.trim() : undefined,
    })
  } catch (e) {
    return { ok: false, kind: 'error', message: (e as Error).message }
  }
}

export const getStudentLeaderboard = () => call<StudentRow[]>('leaderboard/students')

export const getUniversityLeaderboard = () => call<UniversityRow[]>('leaderboard/schools')

export const redeemReward = (rewardId: string) => call<Redemption>('redeem', 'POST', { rewardId })
