/*
 * Impact figures are rough, rounded estimates from common public averages
 * (EPA, DOE, USGS, WRAP). They are meant to make impact tangible, not to be exact.
 *   Grid electricity ≈ 0.4 kg CO₂ per kWh · Car ≈ 0.4 kg CO₂ per mile
 *   Phone charge ≈ 0.008 kg CO₂ · Microwave ≈ 1.1 kW · Fridge ≈ 1.2 kWh/day
 *   A tree absorbs ≈ 22 kg CO₂ a year · Drinking water ≈ 2 L a day
 */

export interface Impact {
  co2: number
  kwh: number
  water: number
  plastic: number
}

export interface Action {
  id: string
  label: string
  emoji: string
  points: number
  /** Most times it counts per day. */
  limit: number
  /** Minutes before the same action counts again. */
  cooldown: number
  impact: Impact
  headline: string
}

/**
 * One number for an action's total impact, in kg of CO₂-equivalent. CO₂ already
 * includes any electricity saved; a single-use plastic item is ≈ 50 g CO₂e to make
 * and throw away, and a liter of tap water ≈ 0.3 g to treat and pump.
 */
export const impactScore = (i: Impact) => i.co2 + 0.05 * i.plastic + 0.0003 * i.water

/** Points follow total impact, so actions rank by how much good they do. */
export const pointsFor = (i: Impact) => 5 + Math.round(15 * impactScore(i))

const none: Impact = { co2: 0, kwh: 0, water: 0, plastic: 0 }

const action = (a: Omit<Action, 'points'>): Action => ({ ...a, points: pointsFor(a.impact) })

/** Highest impact first. */
export const ACTIONS: Action[] = [
  action({
    id: 'secondhand',
    label: 'Bought secondhand',
    emoji: '🏷️',
    limit: 2,
    cooldown: 5,
    impact: { ...none, co2: 2.5, water: 700 },
    headline: 'Skipping a new item saved ~2.5 kg of CO₂ and ~700 L of water',
  }),
  action({
    id: 'donate',
    label: 'Donated clothes',
    emoji: '👚',
    limit: 1,
    cooldown: 5,
    impact: { ...none, co2: 2 },
    headline: 'Giving clothes a second life saves ~2 kg of CO₂',
  }),
  action({
    id: 'volunteer',
    label: 'Volunteered',
    emoji: '🤝',
    limit: 1,
    cooldown: 5,
    impact: { ...none, co2: 1, plastic: 5 },
    headline: 'Your help saved ~1 kg of CO₂ and ~5 pieces of litter',
  }),
  action({
    id: 'plant',
    label: 'Plant-based meal',
    emoji: '🥗',
    limit: 3,
    cooldown: 5,
    impact: { ...none, co2: 1 },
    headline: 'You saved ~1 kg of CO₂ vs. a meat-based meal',
  }),
  action({
    id: 'dry',
    label: 'Air-dried clothes',
    emoji: '🧺',
    limit: 1,
    cooldown: 5,
    impact: { ...none, kwh: 2.5, co2: 1 },
    headline: 'You saved ~2.5 kWh by skipping the dryer',
  }),
  /* Untracked trips earn a short trip's worth. A GPS-tracked trip earns by distance (see route.ts). */
  action({
    id: 'bus',
    label: 'Took transit',
    emoji: '🚌',
    limit: 4,
    cooldown: 5,
    impact: { ...none, co2: 0.6 },
    headline: 'Riding ~3 miles by transit instead of driving saves ~0.6 kg of CO₂',
  }),
  action({
    id: 'coldwash',
    label: 'Cold-water wash',
    emoji: '🫧',
    limit: 1,
    cooldown: 5,
    impact: { ...none, kwh: 1.2, co2: 0.5 },
    headline: 'You saved ~1.2 kWh by not heating the wash water',
  }),
  action({
    id: 'walk',
    label: 'Walked or biked',
    emoji: '🚲',
    limit: 4,
    cooldown: 5,
    impact: { ...none, co2: 0.4 },
    headline: 'Walking or biking ~1 mile instead of driving saves ~0.4 kg of CO₂',
  }),
  action({
    id: 'container',
    label: 'Own container',
    emoji: '🥡',
    limit: 3,
    cooldown: 5,
    impact: { ...none, plastic: 1, co2: 0.1 },
    headline: 'You skipped a single-use takeout box',
  }),
  action({
    id: 'bag',
    label: 'Reusable bag',
    emoji: '🛍️',
    limit: 2,
    cooldown: 5,
    impact: { ...none, plastic: 2, co2: 0.03 },
    headline: 'You kept ~2 plastic bags out of the trash',
  }),
  action({
    id: 'bottle',
    label: 'Reusable bottle',
    emoji: '🥤',
    limit: 3,
    cooldown: 5,
    impact: { ...none, plastic: 1, co2: 0.08 },
    headline: 'You kept 1 plastic bottle out of the trash',
  }),
  action({
    id: 'recycle',
    label: 'Recycled',
    emoji: '♻️',
    limit: 3,
    cooldown: 5,
    impact: { ...none, kwh: 0.2, co2: 0.1 },
    headline: 'You saved ~0.2 kWh by recycling instead of trashing',
  }),
]

export const actionById = (id: string) => ACTIONS.find((a) => a.id === id)

/** The most a free-text "Other" action can claim, so it can't outscore real impact. */
export const OTHER_CAP: Impact = { co2: 1.5, kwh: 3, water: 100, plastic: 3 }

/** Free-text actions. The server's AI check estimates their impact; points follow from it. */
export const OTHER = { id: 'other', label: 'Other', emoji: '✨', points: `5–${pointsFor(OTHER_CAP)}`, limit: 2, cooldown: 0 }

/** How many times an action counts per day. */
export const dailyLimit = (actionId: string) => actionById(actionId)?.limit ?? OTHER.limit

/** Minutes before an action counts again. */
export const cooldownMinutes = (actionId: string) => actionById(actionId)?.cooldown ?? OTHER.cooldown

/** "23 min" or "1 h 5 min". */
export function waitText(ms: number) {
  const m = Math.max(1, Math.ceil(ms / 60_000))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`
}

/** Snaps (and their Spotlight posts) are deleted after this long. Points and impact totals stay. */
export const SNAP_TTL_DAYS = 7

export interface University {
  id: string
  name: string
  short: string
}

export const UNIVERSITIES: University[] = [
  { id: 'asu', name: 'Arizona State University', short: 'ASU' },
  { id: 'berkeley', name: 'UC Berkeley', short: 'Berkeley' },
  { id: 'gt', name: 'Georgia Tech', short: 'Georgia Tech' },
  { id: 'isu', name: 'Iowa State University', short: 'Iowa State' },
  { id: 'ksu', name: 'Kansas State University', short: 'K-State' },
  { id: 'mizzou', name: 'University of Missouri', short: 'Mizzou' },
  { id: 'nyu', name: 'New York University', short: 'NYU' },
  { id: 'osu', name: 'Ohio State University', short: 'Ohio State' },
  { id: 'psu', name: 'Penn State', short: 'Penn State' },
  { id: 'purdue', name: 'Purdue University', short: 'Purdue' },
  { id: 'ucla', name: 'UCLA', short: 'UCLA' },
  { id: 'ku', name: 'University of Kansas', short: 'KU' },
  { id: 'umich', name: 'University of Michigan', short: 'Michigan' },
  { id: 'ut', name: 'UT Austin', short: 'UT Austin' },
  { id: 'uw', name: 'University of Washington', short: 'UW' },
  { id: 'wisc', name: 'UW–Madison', short: 'Wisconsin' },
]

export const universityById = (id: string) => UNIVERSITIES.find((u) => u.id === id) ?? UNIVERSITIES[0]

/* Fake leaderboard entries so early boards aren't empty. Shown at every school. */
/** Fake leaderboard filler — left empty so ranks show only real students. */
export const SEED_STUDENTS: { id: string; name: string; points: number }[] = []

/** Extra school-total filler — zeroed so “All schools” reflects real points only. */
export const SEED_UNIVERSITY_POINTS: Record<string, number> = Object.fromEntries(
  ['asu', 'berkeley', 'gt', 'isu', 'ksu', 'mizzou', 'nyu', 'osu', 'psu', 'purdue', 'ucla', 'ku', 'umich', 'ut', 'uw', 'wisc'].map((id) => [id, 0]),
)

export interface Reward {
  id: string
  shop: string
  offer: string
  points: number
  color: string
}

export const REWARDS: Reward[] = [
  { id: 'grind', shop: 'Daily Grind Coffee', offer: '10% off any drink', points: 100, color: '#111312' },
  { id: 'leaf', shop: 'Green Leaf Café', offer: 'Free pastry with a coffee', points: 250, color: '#047857' },
  { id: 'cycles', shop: 'Campus Cycles', offer: '15% off a bike tune-up', points: 500, color: '#1f2421' },
  { id: 'thrift', shop: 'Second Spin Thrift', offer: '20% off one item', points: 750, color: '#065f46' },
  { id: 'market', shop: 'Fresh Fields Market', offer: '$5 off a $25 order', points: 1000, color: '#2b312e' },
  { id: 'juice', shop: 'Juice Theory', offer: 'Buy one, get one smoothie', points: 1500, color: '#059669' },
]

export const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
