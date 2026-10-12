/*
 * Daily streaks: one verified action a day keeps the streak alive. Every 7 days
 * earns a freeze (max 2) that covers a missed day automatically, and milestones
 * pay bonus points. Days use the phone's local calendar.
 */

export interface Streak {
  count: number
  best: number
  last: string | null
  freezes: number
  days: string[]
  frozen: string[]
}

export interface StreakUpdate {
  count: number
  extended: boolean
  bonus: number
  freezeEarned: boolean
  freezesUsed: number
}

export type StreakStatus = 'done' | 'due' | 'none'

export const MAX_FREEZES = 2
export const MILESTONES: { days: number; bonus: number }[] = [
  { days: 3, bonus: 15 },
  { days: 7, bonus: 40 },
  { days: 14, bonus: 75 },
  { days: 30, bonus: 150 },
  { days: 60, bonus: 250 },
  { days: 100, bonus: 500 },
]
const HISTORY = 21

export const emptyStreak = (): Streak => ({ count: 0, best: 0, last: null, freezes: 0, days: [], frozen: [] })

const pad = (n: number) => String(n).padStart(2, '0')
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (key: string, n: number) => {
  const d = parse(key)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}
const between = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)

/** The streak as of today: a missed day either used up freezes or broke it. */
export function streakNow(s: Streak, today = dayKey()): { count: number; status: StreakStatus } {
  if (!s.last || !s.count) return { count: 0, status: 'none' }
  const gap = between(s.last, today)
  if (gap <= 0) return { count: s.count, status: 'done' }
  if (gap - 1 <= s.freezes) return { count: s.count, status: 'due' }
  return { count: 0, status: 'none' }
}

export const nextMilestone = (count: number) => MILESTONES.find((m) => m.days > count)

/** Records today's action. Mutates and returns what changed. */
export function recordDay(s: Streak, today = dayKey()): StreakUpdate {
  const none = { count: s.count, extended: false, bonus: 0, freezeEarned: false, freezesUsed: 0 }
  if (s.last === today) return none

  const missed = s.last ? between(s.last, today) - 1 : Infinity
  let freezesUsed = 0
  if (missed === 0) s.count += 1
  else if (missed <= s.freezes) {
    freezesUsed = missed
    s.freezes -= missed
    for (let i = 1; i <= missed; i++) s.frozen.push(addDays(s.last!, i))
    s.count += 1
  } else s.count = 1

  s.last = today
  s.best = Math.max(s.best, s.count)
  s.days = [...s.days, today].slice(-HISTORY)
  s.frozen = s.frozen.slice(-HISTORY)

  const freezeEarned = s.count % 7 === 0 && s.freezes < MAX_FREEZES
  if (freezeEarned) s.freezes += 1
  const bonus = MILESTONES.find((m) => m.days === s.count)?.bonus ?? 0
  return { count: s.count, extended: true, bonus, freezeEarned, freezesUsed }
}
