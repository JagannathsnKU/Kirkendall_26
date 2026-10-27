/*
 * Fun daily nudges for students who haven't snapped yet. Up to three local
 * notifications per day (late morning, afternoon, evening). Needs Notification
 * permission; works while the app is open or backgrounded (best when installed).
 */

import { dayKey, streakNow, type Streak } from './streak'

const WANT_KEY = 'ecou-nudge'
const STATE_KEY = 'ecou-nudge-state'
/** Local hours when a nudge can fire, if the student still hasn't snapped. */
const SLOTS = [11, 15, 19] as const
const MAX_PER_DAY = 3
const TICK_MS = 60_000

const MESSAGES = [
  { title: 'Got a green win today?', body: 'Snap it before the day gets away — your streak is counting on you.' },
  { title: 'Hey, quick check-in 🌱', body: 'Any sustainability practice today? Bottle, walk, leftovers in a real container…' },
  { title: 'Streak check!', body: 'One tiny action keeps it alive. Open EcoU and snap something green.' },
  { title: 'Planet called.', body: 'It wants proof. Got 20 seconds for a quick snap?' },
  { title: 'Still time today', body: 'Refill, recycle, ride, or plant-based — pick one and snap it.' },
  { title: 'Don’t ghost your streak', body: 'A freeze can only cover so much. Snap a green action while you’re at it.' },
  { title: 'Small actions, big impact.', body: 'Have you done anything sustainable today? Show us.' },
]

export const remindersSupported = typeof window !== 'undefined' && 'Notification' in window

/** On by default. Only off if the student explicitly turned them off in Me. */
export const remindersWanted = () => {
  try {
    return localStorage.getItem(WANT_KEY) !== '0'
  } catch {
    return true
  }
}

export const setRemindersWanted = (on: boolean) => {
  try {
    localStorage.setItem(WANT_KEY, on ? '1' : '0')
  } catch {
    /* private mode */
  }
}

export const remindersOn = () => remindersSupported && Notification.permission === 'granted' && remindersWanted()

export async function enableReminders() {
  if (!remindersSupported) return false
  setRemindersWanted(true)
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

/** Ask for permission the first time a student is signed in (reminders default on). */
export async function ensureReminders() {
  if (!remindersSupported || !remindersWanted()) return remindersOn()
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

export function disableReminders() {
  setRemindersWanted(false)
}

interface DayState {
  day: string
  /** Slot indexes already used today (0 = morning, 1 = afternoon, 2 = evening). */
  sent: number[]
}

const loadState = (): DayState => {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as DayState
      if (s?.day && Array.isArray(s.sent)) return s
    }
  } catch {
    /* ignore */
  }
  return { day: dayKey(), sent: [] }
}

const saveState = (s: DayState) => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

const pickMessage = (slot: number, day: string) => {
  // Stable per day+slot so a re-tick doesn’t shuffle the same nudge.
  let h = 0
  const key = `${day}:${slot}`
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return MESSAGES[h % MESSAGES.length]
}

async function showNudge(slot: number, day: string) {
  const msg = pickMessage(slot, day)
  const options: NotificationOptions = {
    body: msg.body,
    tag: `ecou-nudge-${slot}`,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/#/snap' },
  }
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  if (reg) await reg.showNotification(msg.title, options)
  else new Notification(msg.title, options)
}

type StreakGetter = () => Streak | null

let timer: ReturnType<typeof setInterval> | null = null
let getStreak: StreakGetter = () => null
let onVis: (() => void) | null = null

async function tick() {
  if (!remindersOn()) return
  const streak = getStreak()
  if (!streak) return
  if (streakNow(streak).status === 'done') return

  const today = dayKey()
  let state = loadState()
  if (state.day !== today) state = { day: today, sent: [] }

  if (state.sent.length >= MAX_PER_DAY) return

  const hour = new Date().getHours()
  const due = SLOTS.map((_, i) => i).filter((i) => hour >= SLOTS[i] && !state.sent.includes(i))
  if (!due.length) return

  // If the app was asleep past several slots, only fire the latest — don’t dump three at once.
  const latest = due[due.length - 1]
  for (const i of due) {
    if (i !== latest) state.sent.push(i)
  }
  if (!state.sent.includes(latest) && state.sent.length < MAX_PER_DAY) {
    await showNudge(latest, today)
    state.sent.push(latest)
  }
  saveState(state)
}

/** Call when a student is signed in. Pass a live streak getter so snaps stop the nudges. */
export function startReminders(streak: StreakGetter) {
  getStreak = streak
  stopReminders()
  void tick()
  timer = setInterval(() => void tick(), TICK_MS)
  onVis = () => {
    if (document.visibilityState === 'visible') void tick()
  }
  document.addEventListener('visibilitychange', onVis)
}

export function stopReminders() {
  if (timer) clearInterval(timer)
  timer = null
  if (onVis) {
    document.removeEventListener('visibilitychange', onVis)
    onVis = null
  }
}

/** Fire any due slots right away (e.g. right after enabling). */
export function checkRemindersNow() {
  void tick()
}
