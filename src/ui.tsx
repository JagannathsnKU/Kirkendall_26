import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Camera, Gift, House, Sparkles, Trophy } from 'lucide-react'
import { fmt, type Impact } from './data'
import { pickFact } from './facts'
import { Glyph } from './glyph'
import { go } from './router'
import { useStore } from './store'

export function CountUp({ value, from = 0, duration = 900, delay = 0 }: { value: number; from?: number; duration?: number; delay?: number }) {
  const [n, setN] = useState(from)
  const raf = useRef(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(value)
      return
    }
    let t0: number | null = null
    const step = (t: number) => {
      if (t0 === null) t0 = t
      const p = Math.min(1, (t - t0) / duration)
      setN(from + (value - from) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    const start = setTimeout(() => (raf.current = requestAnimationFrame(step)), delay)
    // Frames pause in background tabs; make sure the final value always lands.
    const settle = setTimeout(() => setN(value), delay + duration + 100)
    return () => {
      clearTimeout(start)
      clearTimeout(settle)
      cancelAnimationFrame(raf.current)
    }
  }, [value, from, duration, delay])
  return <span className="num">{fmt(Math.round(n))}</span>
}

/** Keep in sync with public/icons/icon.svg. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const id = `leaf${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#059669" />
          <stop offset="1" stopColor="#6ee7b7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="#0d0f0e" />
      <g transform="translate(2 -2)">
        <path d="M15 49l5-5" stroke="#10b981" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M19 45A26 26 0 0 1 45 19A26 26 0 0 1 19 45z" fill={`url(#${id})`} />
        <path d="M23 41l11-11" stroke="#0d0f0e" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span>EcoU</span>
    </span>
  )
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src && failed !== src ? <img src={src} alt="" onError={() => setFailed(src)} /> : name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

export function ShopMark({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (
    <span className="shop-mark" style={{ background: color, width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {initials}
    </span>
  )
}

export function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="bar">
      <span style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </span>
  )
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" />
        {children}
      </div>
    </div>
  )
}

export function QrArt({ seed, size = 160 }: { seed: string; size?: number }) {
  const n = 21
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const rand = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const finder = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9)
  const cells: ReactNode[] = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && rand() > 0.5) cells.push(<rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} />)
  const eye = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} />
    </g>
  )
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${n + 2} ${n + 2}`} shapeRendering="crispEdges" aria-hidden>
      <rect x={-1} y={-1} width={n + 2} height={n + 2} fill="#fff" />
      <g fill="#0d1512">
        {cells}
        {eye(0, 0)}
        {eye(n - 7, 0)}
        {eye(0, n - 7)}
      </g>
    </svg>
  )
}

/* Profile ("me") opens from the avatar on Home. */
const TABS = [
  { path: 'home', label: 'Home', icon: House },
  { path: 'spotlight', label: 'Spotlight', icon: Sparkles },
  { path: 'snap', label: 'Snap', icon: Camera },
  { path: 'board', label: 'Ranks', icon: Trophy },
  { path: 'rewards', label: 'Rewards', icon: Gift },
]

export function TabBar({ active }: { active: string }) {
  const { openCamera } = useStore()
  return (
    <>
      <div className="tabbar-shade" aria-hidden />
      <nav className="tabbar">
        {TABS.map((t) =>
          t.path === 'snap' ? (
            <button key={t.path} className="tab-snap" onClick={openCamera} aria-label="Snap a green action">
              <Camera size={26} strokeWidth={2.2} />
            </button>
          ) : (
            <button key={t.path} className={`tab ${active === t.path ? 'is-on' : ''}`} onClick={() => go(t.path)} aria-current={active === t.path ? 'page' : undefined}>
              <t.icon size={22} strokeWidth={active === t.path ? 2.4 : 1.8} />
              <span>{t.label}</span>
            </button>
          ),
        )}
      </nav>
    </>
  )
}

/** Hides an image that fails to load so its tile's background shows instead of a broken-image icon. */
export const hideBroken = (e: { currentTarget: HTMLImageElement }) => {
  e.currentTarget.style.visibility = 'hidden'
}

/** Small amounts keep their decimals so a single snap doesn't read as "0". */
export const amount = (n: number) => fmt(n, n === 0 || n >= 10 ? 0 : n < 1 ? 2 : 1)

export function ImpactStats({ impact, compact = false }: { impact: Impact; compact?: boolean }) {
  return (
    <div className={`impact-grid is-4 ${compact ? 'is-compact' : ''}`}>
      <div>
        <strong>{amount(impact.co2)}</strong>
        <span>kg CO₂</span>
      </div>
      <div>
        <strong>{amount(impact.kwh)}</strong>
        <span>kWh</span>
      </div>
      <div>
        <strong>{fmt(impact.water)}</strong>
        <span>L water</span>
      </div>
      <div>
        <strong>{fmt(impact.plastic)}</strong>
        <span>plastic</span>
      </div>
    </div>
  )
}

/** A random everyday comparison for a running total, picked again when the total changes. */
export function ImpactFact({ impact }: { impact: Impact }) {
  const { co2, kwh, water, plastic } = impact
  const fact = useMemo(() => pickFact({ co2, kwh, water, plastic }), [co2, kwh, water, plastic])
  if (co2 + kwh + water + plastic <= 0) return null
  return (
    <p className="analogy-line">
      <Glyph emoji={fact.emoji} size={16} strokeWidth={2} />
      {fact.text}
    </p>
  )
}

export function timeAgo(ts: number) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}
