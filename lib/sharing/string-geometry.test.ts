import { describe, it, expect } from "vitest"
import { dragPath, facingAnchors, movedFarEnough, stringPath } from "./string-geometry"

const rect = (left: number, top: number, w = 100, h = 60) => ({ left, top, width: w, height: h })

describe("facingAnchors", () => {
  it("joins the facing sides when the tiles sit side by side", () => {
    const { p1, p2, axis } = facingAnchors(rect(0, 0), rect(200, 0))
    expect(axis).toBe("x")
    expect(p1).toEqual({ x: 100, y: 30 })
    expect(p2).toEqual({ x: 200, y: 30 })
  })

  it("mirrors when the target is to the left", () => {
    const { p1, p2 } = facingAnchors(rect(200, 0), rect(0, 0))
    expect(p1).toEqual({ x: 200, y: 30 })
    expect(p2).toEqual({ x: 100, y: 30 })
  })

  it("uses the right edges when the tiles are stacked, so the string can bulge out", () => {
    const down = facingAnchors(rect(0, 0), rect(0, 200))
    expect(down.axis).toBe("side")
    expect(down.p1).toEqual({ x: 100, y: 30 })
    expect(down.p2).toEqual({ x: 100, y: 230 })
    const up = facingAnchors(rect(0, 200), rect(0, 0))
    expect(up.p1).toEqual({ x: 100, y: 230 })
    expect(up.p2).toEqual({ x: 100, y: 30 })
  })
})

describe("stringPath", () => {
  it("starts and ends on the anchors and droops below the straight line", () => {
    const { d, mid } = stringPath({ x: 0, y: 0 }, { x: 200, y: 0 }, "x", 20)
    expect(d.startsWith("M 0 0 C")).toBe(true)
    expect(d.endsWith("200 0")).toBe(true)
    expect(mid.x).toBeCloseTo(100)
    // y grows downward on screen: a droop is a positive y at the middle.
    expect(mid.y).toBeGreaterThan(0)
  })

  it("is a straight, finite number string even for a zero-length string", () => {
    const { d, mid } = stringPath({ x: 5, y: 5 }, { x: 5, y: 5 }, "x")
    expect(d).not.toContain("NaN")
    expect(Number.isFinite(mid.x) && Number.isFinite(mid.y)).toBe(true)
  })
})

describe("a string between stacked tiles", () => {
  it("bulges out past the right edges, so it never runs through the tiles it joins", () => {
    const { p1, p2, axis } = facingAnchors(rect(0, 0), rect(0, 200))
    const { d, mid } = stringPath(p1, p2, axis)
    expect(d).not.toContain("NaN")
    expect(mid.x).toBeGreaterThan(100)
    // And a longer string bulges further, up to a ceiling.
    const near = stringPath({ x: 100, y: 0 }, { x: 100, y: 100 }, "side").mid.x
    const far = stringPath({ x: 100, y: 0 }, { x: 100, y: 5000 }, "side").mid.x
    expect(far).toBeGreaterThan(near)
    expect(far).toBeLessThanOrEqual(100 + 0.75 * 96 + 0.001)
  })
})

describe("dragging", () => {
  it("builds a path to the pointer", () => {
    expect(dragPath({ x: 0, y: 0 }, { x: 50, y: 10 })).toMatch(/^M 0 0 C .* 50 10$/)
  })

  it("treats a tiny movement as a click and a real one as a drag", () => {
    expect(movedFarEnough({ x: 0, y: 0 }, { x: 2, y: 2 })).toBe(false)
    expect(movedFarEnough({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true)
  })
})
