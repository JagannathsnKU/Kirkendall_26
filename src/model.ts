/* Shapes shared by the app and the server. Keep it free of browser code: the server imports it. */
import type { Action, Impact } from './data.ts'
import type { Streak, StreakUpdate } from './streak.ts'

export interface User {
  id: string
  name: string
  email: string
  universityId: string
  points: number
  impact: Impact
  streak: Streak
  /** Listed in ADMIN_EMAILS on the server. */
  admin?: boolean
}

export type MediaKind = 'photo' | 'video'

export interface Snap {
  id: string
  actionId: string
  label: string
  emoji: string
  kind: MediaKind
  ts: number
  points: number
  thumb: string
}

/** A snap shared to the poster's school Spotlight. */
export interface Post {
  id: string
  name: string
  label: string
  emoji: string
  kind: MediaKind
  url: string
  poster: string | null
  score: number
  myVote: -1 | 0 | 1
  mine: boolean
  reported: boolean
  bonus: number
  ts: number
}

export type ReportReason = 'fake' | 'inappropriate' | 'spam' | 'other'

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'fake', label: 'Fake or not a real action' },
  { id: 'inappropriate', label: 'Inappropriate or offensive' },
  { id: 'spam', label: 'Spam or unrelated' },
  { id: 'other', label: 'Something else' },
]

/** Activity log entries. The first group are cheating signals shown on the admin Activity tab. */
export const EVENT_LABELS: Record<string, string> = {
  screen: 'AI saw a screen or stock photo',
  duplicate: 'Reused an old photo',
  rate_limit: 'Sent too many snaps at once',
  downvoted: 'Post voted down',
  reported: 'Post reported',
  ai_hidden: 'AI hid a post',
  rejected: 'AI rejected a snap',
  points: 'Points taken back',
  revoked: 'Snap revoked',
  post_removed: 'Post taken down',
  kept: 'Post kept after review',
  flagged: 'Flagged by admin',
  cleared: 'Flag dismissed',
  banned: 'Suspended',
  unbanned: 'Unsuspended',
}

export const SUSPICIOUS_EVENTS = ['screen', 'duplicate', 'rate_limit', 'downvoted', 'reported', 'ai_hidden']

export interface AdminSummary {
  open: number
  unread: number
}

export interface AdminUserRow {
  id: string
  name: string
  email: string
  school: string
  points: number
  banned: boolean
  flagged: boolean
  admin: boolean
}

export interface ActivityEvent {
  id: string
  userId: string
  name: string
  kind: string
  detail: string
  by: string | null
  ts: number
}

export interface AdminActivity {
  top: { userId: string; name: string; count: number }[]
  events: ActivityEvent[]
}

export interface AdminUserDetail extends AdminUserRow {
  snaps: (Snap & { posted: boolean })[]
  events: ActivityEvent[]
}

export interface AiReview {
  verdict: 'ok' | 'remove' | 'error'
  reason: string
}

/** An open item in the admin review queue: a post that was voted down or reported, or a user. */
export interface FlagItem {
  id: string
  kind: 'post' | 'user'
  reason: 'downvotes' | 'reports' | 'activity' | 'admin'
  note: string
  reports: { reason: string; count: number }[]
  ai: AiReview | null
  ts: number
  user: AdminUserRow
  post: {
    id: string
    kind: MediaKind
    url: string
    poster: string | null
    label: string
    emoji: string
    score: number
    hidden: boolean
    /** Snap points plus Spotlight bonus: what taking it down with "take back points" removes. */
    points: number
  } | null
}

/** Net upvotes a post needs for each bonus. Bonuses add up and are never taken back. */
export const SPOTLIGHT_BONUSES = [
  { votes: 3, bonus: 10 },
  { votes: 10, bonus: 25 },
  { votes: 25, bonus: 50 },
]

export const spotlightBonus = (score: number) =>
  SPOTLIGHT_BONUSES.filter((b) => score >= b.votes).reduce((sum, b) => sum + b.bonus, 0)

export interface Redemption {
  rewardId: string
  code: string
  ts: number
}

export interface Session {
  user: User
  snaps: Snap[]
  redemptions: Redemption[]
}

export interface StudentRow {
  id: string
  name: string
  points: number
  me: boolean
}

export interface UniversityRow {
  id: string
  name: string
  short: string
  points: number
  me: boolean
}

export interface SnapResult {
  snapId: string
  action: Action
  thumb: string
  points: number
  total: number
  rankBefore: number
  rankAfter: number
  universityRank: number
  streak: StreakUpdate
  /** Set by the app after it tries to post the snap to Spotlight. */
  spotlight?: 'shared' | 'failed'
}

export type SubmitOutcome =
  | { ok: true; result: SnapResult }
  | { ok: false; kind: 'limit' | 'duplicate' | 'rejected' | 'error'; message: string }

export const DAILY_LIMIT = 2
