/* Shapes shared by the app and the server. Keep it free of browser code: the server imports it. */
import type { Action, Impact } from './data.ts'
import type { Fact } from './facts.ts'
import type { Streak, StreakUpdate } from './streak.ts'

export interface User {
  id: string
  name: string
  email: string
  universityId: string
  points: number
  impact: Impact
  streak: Streak
  /** Profile picture URL, or null to show their initial. */
  avatar: string | null
  /** Listed in ADMIN_EMAILS on the server. */
  admin?: boolean
}

/** Versioned so phones can cache a profile picture until it changes. */
export const avatarUrl = (userId: string, at: string | number) => (Number(at) ? `/api/avatar?u=${userId}&v=${at}` : null)

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

/** Everything shown when a student opens one of their snaps. */
export interface SnapDetail {
  /** Larger image than the thumbnail; empty for snaps from before it was stored. */
  photo: string
  impact: Impact | null
  headline: string | null
  analogy: string | null
  analogyEmoji: string | null
  /** The GPS trip the snap was logged with, if any. */
  trip: { miles: number; minutes: number; avgMph: number } | null
  /** The clip or photo, if it was shared to Spotlight. */
  post: { kind: MediaKind; url: string; poster: string | null; score: number } | null
}

/** A snap shared to the poster's school Spotlight. */
export interface Post {
  id: string
  name: string
  avatar: string | null
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
  trip: 'GPS trip didn’t match the action',
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

export const SUSPICIOUS_EVENTS = ['screen', 'duplicate', 'rate_limit', 'trip', 'downvoted', 'reported', 'ai_hidden']

export interface AdminSummary {
  open: number
  unread: number
}

/** Totals across every student, for the top of the admin dashboard. */
export interface AdminOverview {
  students: number
  snapsThisWeek: number
  impact: Impact
}

export interface AdminUserRow {
  id: string
  name: string
  email: string
  school: string
  points: number
  impact: Impact
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

/** A Spotlight post as admins see it: any school, including hidden ones. */
export interface AdminPost {
  id: string
  kind: MediaKind
  url: string
  poster: string | null
  label: string
  emoji: string
  score: number
  hidden: boolean
  reports: number
  points: number
  ts: number
  user: { id: string; name: string; school: string }
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

/** Every UPVOTE_STEP net upvotes on a Spotlight post earns UPVOTE_BONUS points. Bonuses are never taken back. */
export const UPVOTE_STEP = 10
export const UPVOTE_BONUS = 10

export const spotlightBonus = (score: number) => Math.floor(Math.max(0, score) / UPVOTE_STEP) * UPVOTE_BONUS

/** Net upvotes where the next bonus lands. */
export const nextUpvoteBonus = (score: number) => (Math.floor(Math.max(0, score) / UPVOTE_STEP) + 1) * UPVOTE_STEP

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
  fact: Fact
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
