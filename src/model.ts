/* Shapes shared by the app and the server. Keep it free of browser code: the server imports it. */
import type { Action, Impact } from './data.ts'
import type { Streak, StreakUpdate } from './streak.ts'

export interface User {
  name: string
  email: string
  universityId: string
  points: number
  impact: Impact
  streak: Streak
}

export interface Snap {
  id: string
  actionId: string
  label: string
  emoji: string
  ts: number
  points: number
  thumb: string
}

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
  action: Action
  thumb: string
  points: number
  total: number
  rankBefore: number
  rankAfter: number
  universityRank: number
  streak: StreakUpdate
}

export type SubmitOutcome =
  | { ok: true; result: SnapResult }
  | { ok: false; kind: 'limit' | 'duplicate' | 'rejected' | 'error'; message: string }

export const DAILY_LIMIT = 2
