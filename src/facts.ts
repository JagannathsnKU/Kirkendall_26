/*
 * Everyday comparisons that make an impact easy to picture. One is picked at random
 * from those that give a sensible number, so the same kind of action reads differently
 * from snap to snap. Rough public averages:
 *   Phone charge ≈ 0.008 kg CO₂ · 10 W LED ≈ 0.004 kg CO₂ an hour · Party balloon ≈ 15 L of gas
 *   A tree absorbs ≈ 22 kg CO₂ a year · Streaming video ≈ 36 g CO₂ an hour · Car ≈ 0.4 kg CO₂ a mile
 *   Kettle boil ≈ 0.1 kWh · Microwave ≈ 1.1 kW · Fridge ≈ 1.2 kWh a day · Laptop ≈ 50 W
 *   Drinking water ≈ 2 L a day · Shower ≈ 8 L a minute · Toilet flush ≈ 6 L · Bathtub ≈ 150 L
 */
import type { Impact } from './data.ts'

export interface Fact {
  text: string
  emoji: string
}

/** 1.5, 12, 340, 1,400. */
function nice(n: number) {
  if (n < 3) return String(Math.round(n * 10) / 10)
  if (n < 100) return String(Math.round(n))
  const step = 10 ** (Math.floor(Math.log10(n)) - 1)
  return (Math.round(n / step) * step).toLocaleString('en-US')
}

const times = (n: number) => (nice(n) === '1' ? 'once' : `${nice(n)} times`)
const count = (n: number, one: string, many = `${one}s`) => `${nice(n)} ${nice(n) === '1' ? one : many}`

type Make = (i: Impact) => [value: number, emoji: string, say: (n: number) => string]

const COMPARISONS: Make[] = [
  (i) => [i.co2 / 0.008, '📱', (n) => `charging a phone ${times(n)}`],
  (i) => [i.co2 / 0.004, '💡', (n) => (n < 48 ? `leaving an LED bulb on for ${count(n, 'hour')}` : `leaving an LED bulb on for ${count(n / 24, 'day')}`)],
  (i) => [i.co2 * 34, '🎈', (n) => `${count(n, 'party balloon')} full of CO₂`],
  (i) => [i.co2 / 0.06, '🌳', (n) => `what a tree absorbs in ${count(n, 'day')}`],
  (i) => [i.co2 / 0.036, '📺', (n) => `${count(n, 'hour')} of streaming video`],
  (i) => [i.co2 * 2.5, '🚗', (n) => `not driving ${count(n, 'mile')}`],
  (i) => [i.co2 / 0.04, '☕', (n) => `boiling a full kettle ${times(n)}`],
  (i) => [i.kwh * 54.5, '🍿', (n) => `running a microwave for ${count(n, 'minute')}`],
  (i) => [i.kwh / 1.2, '🧊', (n) => `powering a fridge for ${count(n, 'day')}`],
  (i) => [i.kwh / 0.05, '💻', (n) => `${count(n, 'hour')} of laptop use`],
  (i) => [i.water / 2, '💧', (n) => `${count(n, 'day')} of drinking water`],
  (i) => [i.water / 8, '🚿', (n) => `${count(n, 'minute')} in the shower`],
  (i) => [i.water / 6, '🚽', (n) => `${count(n, 'toilet flush', 'toilet flushes')}`],
  (i) => [i.water / 150, '🛁', (n) => `${count(n, 'full bathtub')}`],
  (i) => [i.plastic, '⏳', (n) => `keeping ${count(n, 'piece')} of plastic out of a landfill, where it would last 400+ years`],
  (i) => [i.plastic, '🌊', (n) => `keeping ${count(n, 'piece')} of plastic out of rivers and oceans`],
]

/** A random comparison that fits this impact, e.g. "That’s like 36 party balloons full of CO₂". */
export function pickFact(impact: Impact, random = Math.random): Fact {
  const options = COMPARISONS.map((make) => make(impact)).filter(([n]) => n >= 1 && n <= 5000)
  if (!options.length) return { text: 'Every small action adds up', emoji: '🌍' }
  const [n, emoji, say] = options[Math.floor(random() * options.length)]
  return { text: `That’s like ${say(n)}`, emoji }
}
