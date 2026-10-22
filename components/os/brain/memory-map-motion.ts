import { useEffect, type RefObject } from "react"

/** Furthest a dot wanders from its laid-out spot, in graph units: below a dot's radius, so links still meet it. */
export const DRIFT = 4
/** One spark starts this often (ms); each takes SPARK_MS..1.7x to cross its link. */
const SPARK_EVERY = 380
const SPARK_MS = 700
const SVG_NS = "http://www.w3.org/2000/svg"

/** Stable 0..1 from an id, so a dot keeps its own rhythm across renders. */
export function phase(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** Where a dot has drifted at time t (seconds): a slow loop around its spot, never further than DRIFT. */
export function drift(id: string, t: number): { dx: number; dy: number } {
  const p = phase(id) * Math.PI * 2
  const speed = 0.25 + phase(`${id}~`) * 0.35
  const amp = DRIFT * (0.6 + phase(`${id}#`) * 0.4) * Math.SQRT1_2
  return { dx: Math.sin(t * speed + p) * amp, dy: Math.cos(t * speed * 0.8 + p * 1.3) * amp }
}

type Point = { x?: number; y?: number }

/**
 * Keeps the map moving: dots drift, and sparks run along the drawn links and
 * light the dot they reach. It writes straight to the svg (the elements
 * MapCanvas marks with data-node / data-edge) instead of re-rendering React
 * sixty times a second. Off while `paused`, and for anyone with reduced motion.
 */
export function useAliveMotion(
  layer: RefObject<SVGGElement | null>,
  pos: Map<string, Point>,
  colorOf: (id: string) => string,
  paused: boolean
) {
  useEffect(() => {
    const root = layer.current
    const sparks = root?.querySelector<SVGGElement>("[data-sparks]")
    if (!root || !sparks || paused || !pos.size) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const live: { el: SVGCircleElement; from: string; to: string; t0: number; ms: number }[] = []
    const at = (id: string, t: number) => {
      const p = pos.get(id)
      const { dx, dy } = drift(id, t)
      return { x: (p?.x ?? 0) + dx, y: (p?.y ?? 0) + dy }
    }
    let lastSpark = 0
    let frame = 0

    const tick = (now: number) => {
      const t = now / 1000
      for (const el of root.querySelectorAll<SVGGElement>("[data-node]")) {
        const { x, y } = at(el.dataset.node!, t)
        el.setAttribute("transform", `translate(${x}, ${y})`)
      }
      const lines = [...root.querySelectorAll<SVGLineElement>("[data-edge]")]
      for (const el of lines) {
        const a = at(el.dataset.source!, t)
        const b = at(el.dataset.target!, t)
        el.setAttribute("x1", `${a.x}`)
        el.setAttribute("y1", `${a.y}`)
        el.setAttribute("x2", `${b.x}`)
        el.setAttribute("y2", `${b.y}`)
      }
      if (lines.length && now - lastSpark > SPARK_EVERY) {
        lastSpark = now
        const line = lines[Math.floor(Math.random() * lines.length)]
        const ends = [line.dataset.source!, line.dataset.target!]
        const [from, to] = Math.random() < 0.5 ? ends : ends.reverse()
        const el = document.createElementNS(SVG_NS, "circle")
        el.setAttribute("r", "2.2")
        el.setAttribute("class", "mm-spark")
        el.style.setProperty("--spark", colorOf(to))
        sparks.appendChild(el)
        live.push({ el, from, to, t0: now, ms: SPARK_MS * (1 + Math.random() * 0.7) })
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const s = live[i]
        const p = Math.min(1, (now - s.t0) / s.ms)
        const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
        const a = at(s.from, t)
        const b = at(s.to, t)
        s.el.setAttribute("cx", `${a.x + (b.x - a.x) * e}`)
        s.el.setAttribute("cy", `${a.y + (b.y - a.y) * e}`)
        s.el.setAttribute("opacity", `${Math.sin(p * Math.PI)}`)
        if (p < 1) continue
        s.el.remove()
        live.splice(i, 1)
        // The dot it reached flares once; the CSS animation fades it and it removes itself.
        const flare = document.createElementNS(SVG_NS, "circle")
        flare.setAttribute("class", "mm-flare")
        flare.setAttribute("cx", `${b.x}`)
        flare.setAttribute("cy", `${b.y}`)
        flare.setAttribute("r", "10")
        flare.style.setProperty("--spark", colorOf(s.to))
        flare.addEventListener("animationend", () => flare.remove())
        sparks.appendChild(flare)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      sparks.replaceChildren()
    }
  }, [layer, pos, colorOf, paused])
}
