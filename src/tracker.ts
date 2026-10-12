/*
 * Records a GPS trip while the app is open. Web apps can't track in the background,
 * so the screen is kept awake and the trip survives reloads in localStorage.
 */
import { useSyncExternalStore } from 'react'
import { TRIP, type TripMode, type TripPoint } from './route'

const KEY = 'ecou:trip'
/** Skip a new position unless it moved this far or this much time passed. */
const MIN_STEP_M = 5
const MIN_STEP_MS = 15_000

export interface Trip {
  mode: TripMode
  start: number
  points: TripPoint[]
  /** Set when the student finishes the trip. */
  end?: number
}

export type GpsStatus = 'off' | 'waiting' | 'ok' | 'weak' | 'denied' | 'unavailable'

let trip: Trip | null = load()
let status = 'off' as GpsStatus
let watchId: number | null = null
let wakeLock: WakeLockSentinel | null = null
let snapshot = { trip, status }
const listeners = new Set<() => void>()

function load(): Trip | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    return null
  }
}

function update(next: Trip | null, nextStatus = status) {
  trip = next
  status = nextStatus
  if (trip) localStorage.setItem(KEY, JSON.stringify(trip))
  else localStorage.removeItem(KEY)
  snapshot = { trip, status }
  listeners.forEach((l) => l())
}

function onPosition(p: GeolocationPosition) {
  if (!trip || trip.end) return
  const point: TripPoint = [p.coords.latitude, p.coords.longitude, p.timestamp, Math.round(p.coords.accuracy)]
  const weak = point[3] > TRIP.MAX_ACCURACY_M
  const last = trip.points.at(-1)
  const moved = !last || approxMeters(last, point) >= MIN_STEP_M || point[2] - last[2] >= MIN_STEP_MS
  if (weak || !moved) return update(trip, weak ? 'weak' : 'ok')
  let points = [...trip.points, point]
  if (points.length > TRIP.MAX_POINTS) points = points.filter((_, i) => i % 2 === 0 || i === points.length - 1)
  update({ ...trip, points }, 'ok')
}

function onError(e: GeolocationPositionError) {
  update(trip, e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')
}

function approxMeters(a: TripPoint, b: TripPoint) {
  const y = (b[0] - a[0]) * 111_320
  const x = (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180)
  return Math.hypot(x, y)
}

async function keepAwake() {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null
  } catch {
    wakeLock = null
  }
}

/** Starts (or restarts after a reload) watching the location for an unfinished trip. */
export function resumeTrip() {
  if (!trip || trip.end || watchId !== null) return
  if (!navigator.geolocation) return update(trip, 'unavailable')
  if (status === 'off') update(trip, 'waiting')
  watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 60_000 })
  keepAwake()
}

function stopWatching() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  watchId = null
  wakeLock?.release().catch(() => {})
  wakeLock = null
}

export function startTrip(mode: TripMode) {
  stopWatching()
  update({ mode, start: Date.now(), points: [] }, 'waiting')
  resumeTrip()
}

export function finishTrip() {
  stopWatching()
  if (trip && !trip.end) update({ ...trip, end: Date.now() }, 'off')
}

export function discardTrip() {
  stopWatching()
  update(null, 'off')
}

/** A finished trip still recent enough to attach to a snap. */
export function pendingTrip(t: Trip | null, now = Date.now()) {
  return t?.end && now - t.end < TRIP.SNAP_WITHIN_MIN * 60_000 ? t : null
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !trip || trip.end) return
  if (watchId === null) resumeTrip()
  else if (!wakeLock || wakeLock.released) keepAwake()
})

export function useTrip() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )
}
