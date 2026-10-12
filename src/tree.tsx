/*
 * A tree that grows with your points. The frames in /public/tree are pre-rendered
 * from a 3D tree model, from bare branches to a full canopy. Points pick the frame
 * (cross-fading between neighbours) and the tree's size, and new growth animates
 * the next time Home opens.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const FRAMES = 12
const FULL_AT = 1500
const SEEN_KEY = 'ecou:tree-seen'
const frame = (i: number) => `/tree/stage-${String(i).padStart(2, '0')}.webp`

/** 0 is a young bare tree, 1 is a full canopy (reached at the top reward's points). */
export const growthFor = (points: number) => Math.min(1, Math.sqrt(Math.max(0, points) / FULL_AT))

function preload(from: number, to: number) {
  const lo = Math.floor(Math.min(from, to) * (FRAMES - 1))
  const hi = Math.ceil(Math.max(from, to) * (FRAMES - 1))
  const all = []
  for (let i = lo; i <= hi; i++) {
    const img = new Image()
    img.src = frame(i)
    all.push(img.decode().catch(() => {}))
  }
  return Promise.all(all)
}

export function Tree({ points }: { points: number }) {
  const grow = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLImageElement>(null)
  const front = useRef<HTMLImageElement>(null)
  const shown = useRef(-1)

  const paint = (g: number) => {
    shown.current = g
    const f = g * (FRAMES - 1)
    const lo = Math.floor(f)
    const hi = Math.min(FRAMES - 1, lo + 1)
    const setSrc = (img: HTMLImageElement | null, src: string) => {
      if (img && img.getAttribute('src') !== src) img.setAttribute('src', src)
    }
    setSrc(back.current, frame(lo))
    setSrc(front.current, frame(hi))
    if (front.current) front.current.style.opacity = String(f - lo)
    if (grow.current) grow.current.style.transform = `scale(${0.55 + 0.45 * g})`
  }

  const [start] = useState(() => {
    const seen = localStorage.getItem(SEEN_KEY)
    return growthFor(seen === null ? points : Math.min(Number(seen) || 0, points))
  })

  useLayoutEffect(() => paint(start), [start])

  useEffect(() => {
    localStorage.setItem(SEEN_KEY, String(points))
    const from = shown.current
    const to = growthFor(points)
    if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paint(to)
      return
    }
    let raf = 0
    let cancelled = false
    preload(from, to).then(() => {
      if (cancelled) return
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start - 250) / 1600))
        paint(from + (to - from) * (1 - (1 - t) ** 3))
        if (t < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [points])

  return (
    <div className="tree" role="img" aria-label="Your tree">
      <div className="tree-sway">
        <div className="tree-grow" ref={grow}>
          <img ref={back} alt="" decoding="async" />
          <img ref={front} alt="" decoding="async" />
        </div>
      </div>
    </div>
  )
}
