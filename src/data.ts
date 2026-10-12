/*
 * Impact figures are rough, rounded estimates from common public averages
 * (EPA, DOE, USGS). They are meant to make impact tangible, not to be exact.
 *   Grid electricity ≈ 0.4 kg CO₂ per kWh · Car ≈ 0.25 kg CO₂ per km
 *   Phone charge ≈ 0.008 kg CO₂ · Microwave ≈ 1.1 kW · Fridge ≈ 1.2 kWh/day
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
  impact: Impact
  headline: string
  analogy: string
  analogyEmoji: string
}

const none: Impact = { co2: 0, kwh: 0, water: 0, plastic: 0 }

export const ACTIONS: Action[] = [
  {
    id: 'walk',
    label: 'Walked or biked',
    emoji: '🚲',
    points: 30,
    impact: { ...none, co2: 1.2 },
    headline: 'You skipped ~1.2 kg of CO₂ by not driving 5 km',
    analogy: 'That’s like charging your phone 150 times',
    analogyEmoji: '📱',
  },
  {
    id: 'bus',
    label: 'Took transit',
    emoji: '🚌',
    points: 25,
    impact: { ...none, co2: 1.6 },
    headline: 'You saved ~1.6 kg of CO₂ vs. driving 10 km',
    analogy: 'That’s what a tree absorbs in about 3 weeks',
    analogyEmoji: '🌳',
  },
  {
    id: 'lights',
    label: 'Lights off',
    emoji: '💡',
    points: 10,
    impact: { ...none, kwh: 0.1, co2: 0.04 },
    headline: 'You saved ~0.1 kWh of electricity',
    analogy: 'That’s like 6 minutes of microwave time',
    analogyEmoji: '🍿',
  },
  {
    id: 'bottle',
    label: 'Reusable bottle',
    emoji: '🥤',
    points: 10,
    impact: { ...none, plastic: 1, co2: 0.08 },
    headline: 'You kept 1 plastic bottle out of the trash',
    analogy: 'It would’ve taken ~450 years to break down',
    analogyEmoji: '⏳',
  },
  {
    id: 'plant',
    label: 'Plant-based meal',
    emoji: '🥗',
    points: 20,
    impact: { ...none, co2: 1 },
    headline: 'You saved ~1 kg of CO₂ vs. a meat-based meal',
    analogy: 'That’s like not driving 4 km',
    analogyEmoji: '🚗',
  },
  {
    id: 'shower',
    label: 'Shorter shower',
    emoji: '🚿',
    points: 15,
    impact: { ...none, water: 38, kwh: 1, co2: 0.4 },
    headline: 'You saved ~38 L of water by cutting 5 minutes',
    analogy: 'That’s 2 weeks of drinking water',
    analogyEmoji: '💧',
  },
  {
    id: 'recycle',
    label: 'Recycled',
    emoji: '♻️',
    points: 10,
    impact: { ...none, kwh: 0.2, co2: 0.1 },
    headline: 'You saved ~0.2 kWh by recycling instead of trashing',
    analogy: 'That’s enough to run a TV for 3 hours',
    analogyEmoji: '📺',
  },
  {
    id: 'dry',
    label: 'Air-dried laundry',
    emoji: '👕',
    points: 25,
    impact: { ...none, kwh: 2.5, co2: 1 },
    headline: 'You saved ~2.5 kWh by skipping the dryer',
    analogy: 'That’s like powering a fridge for 2 days',
    analogyEmoji: '🧊',
  },
]

export const actionById = (id: string) => ACTIONS.find((a) => a.id === id)

/** Free-text actions. The server's AI check writes their impact message and scores them. */
export const OTHER = { id: 'other', label: 'Other', emoji: '✨', points: '5–20' }

export const KM_PER_KG_CO2 = 4

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
export const SEED_STUDENTS = [1240, 1105, 980, 870, 760, 640, 525, 410, 320, 240, 180, 120, 75, 35, 5].map((points, i) => ({
  id: `demo-${i + 1}`,
  name: `Demo ${i + 1}`,
  points,
}))

export const SEED_UNIVERSITY_POINTS: Record<string, number> = {
  asu: 151200,
  berkeley: 198400,
  gt: 142900,
  isu: 96300,
  ksu: 88700,
  mizzou: 101500,
  nyu: 133800,
  osu: 176100,
  psu: 164300,
  purdue: 128600,
  ucla: 187900,
  ku: 117400,
  umich: 181200,
  ut: 169500,
  uw: 192700,
  wisc: 158800,
}

export interface Reward {
  id: string
  shop: string
  offer: string
  points: number
  color: string
}

export const REWARDS: Reward[] = [
  { id: 'grind', shop: 'Daily Grind Coffee', offer: '10% off any drink', points: 100, color: '#8a5a3b' },
  { id: 'leaf', shop: 'Green Leaf Café', offer: 'Free pastry with a coffee', points: 250, color: '#4f8a3c' },
  { id: 'cycles', shop: 'Campus Cycles', offer: '15% off a bike tune-up', points: 500, color: '#2f5d73' },
  { id: 'thrift', shop: 'Second Spin Thrift', offer: '20% off one item', points: 750, color: '#b5654a' },
  { id: 'market', shop: 'Fresh Fields Market', offer: '$5 off a $25 order', points: 1000, color: '#c28a1e' },
  { id: 'juice', shop: 'Juice Theory', offer: 'Buy one, get one smoothie', points: 1500, color: '#a0457a' },
]

export const fmt = (n: number, d = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
