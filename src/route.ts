/*
 * GPS trips for walking, biking and transit. The phone records a trail of positions;
 * the same math runs live on the phone and again on the server, which decides whether
 * the speeds fit the mode and credits CO₂ by distance.
 */
import type { Impact } from './data.ts'

export type TripMode = 'walk' | 'bus'

/** [latitude, longitude, time in ms, accuracy in meters] */
export type TripPoint = [number, number, number, number]

export interface TripSummary {
  miles: number
  minutes: number
  avgMph: number
  /** Speed held for at least 15% of the moving time, so one GPS glitch doesn't count. */
  fastMph: number
  /** Fastest stretch of at least a quarter mile. */
  topMph: number
  /** Positions skipped for being impossibly far from the trail. */
  jumps: number
  points: number
  start: number
  end: number
}

export const TRIP = {
  /** Positions less accurate than this are ignored. */
  MAX_ACCURACY_M: 60,
  MAX_POINTS: 2000,
  MIN_POINTS: 6,
  MIN_MINUTES: 2,
  MAX_MINUTES: 4 * 60,
  MIN_MILES: 0.2,
  /** The snap must come soon after the trip ends. */
  SNAP_WITHIN_MIN: 20,
  WALK_MAX_MPH: 22,
  BUS_MIN_MPH: 9,
  TELEPORT_MPH: 150,
  /** Slower "movement" than this is GPS drift, not travel. */
  DRIFT_MPH: 1,
  /** Average speed above which a walk counts as a bike ride. */
  BIKE_MPH: 7,
  /** Most miles one trip can earn. */
  MAX_MILES: { walk: 8, bus: 25 } as Record<TripMode, number>,
  /** CO₂ saved per mile vs. driving alone (a car ≈ 0.4 kg; transit's own share ≈ 0.2 kg). */
  CO2_PER_MILE: { walk: 0.4, bus: 0.2 } as Record<TripMode, number>,
}

const METERS_PER_MILE = 1609.34

function meters(a: TripPoint, b: TripPoint) {
  const rad = Math.PI / 180
  const dLat = (b[0] - a[0]) * rad
  const dLng = (b[1] - a[1]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Distance, time and speeds of a trail. GPS drift while standing still isn't counted as
 * distance, and a lone position far off the trail is skipped as a glitch.
 */
export function summarize(trail: TripPoint[]): TripSummary {
  const points = trail.filter((p) => p[3] <= TRIP.MAX_ACCURACY_M).sort((a, b) => a[2] - b[2])
  const hops: { m: number; h: number }[] = []
  let jumps = 0
  let anchor = points[0]
  for (const p of points.slice(1)) {
    const m = meters(anchor, p)
    const h = (p[2] - anchor[2]) / 3_600_000
    if (h <= 0 || m < Math.max(20, anchor[3] + p[3])) continue
    const speed = m / METERS_PER_MILE / h
    if (speed > TRIP.TELEPORT_MPH && m > 200) {
      jumps++
      continue
    }
    if (speed >= TRIP.DRIFT_MPH) hops.push({ m, h })
    anchor = p
  }
  const miles = hops.reduce((t, s) => t + s.m, 0) / METERS_PER_MILE
  const start = points[0]?.[2] ?? 0
  const end = points.at(-1)?.[2] ?? 0
  const hours = (end - start) / 3_600_000
  const mph = (s: { m: number; h: number }) => s.m / METERS_PER_MILE / s.h

  const bySpeed = [...hops].sort((a, b) => mph(a) - mph(b))
  const moving = hops.reduce((t, s) => t + s.h, 0)
  let elapsed = 0
  const fast = bySpeed.find((s) => (elapsed += s.h) >= moving * 0.85)

  return {
    miles: round(miles, 2),
    minutes: round(hours * 60, 1),
    avgMph: hours > 0 ? round(miles / hours, 1) : 0,
    fastMph: fast ? round(mph(fast), 1) : 0,
    topMph: round(Math.max(0, ...hops.filter((s) => s.m >= METERS_PER_MILE / 4).map(mph)), 1),
    jumps,
    points: points.length,
    start,
    end,
  }
}

/** Why a trip can't count, or null if it checks out. Suspicious problems look like cheating rather than bad luck. */
export function checkTrip(mode: TripMode, s: TripSummary, now = Date.now()): { reason: string; suspicious: boolean } | null {
  const fail = (reason: string, suspicious = false) => ({ reason, suspicious })
  if (s.points < TRIP.MIN_POINTS || s.minutes < TRIP.MIN_MINUTES) return fail('That trip is too short to count. Track at least a few minutes.')
  if (s.minutes > TRIP.MAX_MINUTES) return fail('That trip is too long to count. Start a new one for each ride.')
  if (s.end > now + 60_000 || now - s.end > TRIP.SNAP_WITHIN_MIN * 60_000) return fail(`Snap within ${TRIP.SNAP_WITHIN_MIN} minutes of finishing your trip.`)
  if (s.miles < TRIP.MIN_MILES) return fail(`Travel at least ${TRIP.MIN_MILES} miles for a trip to count.`)
  if (s.jumps > Math.max(3, s.points / 10)) return fail('Your location jumped around too much to trust this trip.', true)
  if (mode === 'walk' && (s.fastMph > TRIP.WALK_MAX_MPH || s.topMph > TRIP.WALK_MAX_MPH * 2)) return fail('That was too fast for walking or biking. It looks like a car or bus ride.', true)
  if (mode === 'bus' && s.fastMph < TRIP.BUS_MIN_MPH) return fail('This trip never reached bus or train speed. Log it as a walk instead.')
  return null
}

export const isBike = (mode: TripMode, s: TripSummary) => mode === 'walk' && s.avgMph >= TRIP.BIKE_MPH

export function tripImpact(mode: TripMode, miles: number): Impact {
  return { co2: round(Math.min(miles, TRIP.MAX_MILES[mode]) * TRIP.CO2_PER_MILE[mode], 2), kwh: 0, water: 0, plastic: 0 }
}

export function tripHeadline(mode: TripMode, s: TripSummary) {
  const co2 = tripImpact(mode, s.miles).co2
  const verb = mode === 'bus' ? 'rode transit' : isBike(mode, s) ? 'biked' : 'walked'
  const capped = s.miles > TRIP.MAX_MILES[mode] ? ` (up to ${TRIP.MAX_MILES[mode]} mi count)` : ''
  return `You ${verb} ${milesText(s.miles)} instead of driving and saved ~${co2} kg of CO₂${capped}`
}

export function milesText(miles: number) {
  const n = miles < 10 ? round(miles, 1) : Math.round(miles)
  return `${n} ${n === 1 ? 'mile' : 'miles'}`
}

function round(n: number, digits: number) {
  const f = 10 ** digits
  return Math.round(n * f) / f
}
