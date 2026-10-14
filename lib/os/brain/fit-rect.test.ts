import { describe, expect, it } from "vitest"
import { fitRect } from "./memory-core"

const view = { w: 880, h: 600 }

describe("fitRect", () => {
  it("returns null with nothing to frame", () => {
    expect(fitRect(view, [], 80, 1.7)).toBeNull()
  })
  it("zooms in on a small spread, keeping the stage's aspect ratio", () => {
    const r = fitRect(view, [{ x: 400, y: 280 }, { x: 480, y: 320 }], 80, 1.7)!
    expect(r.w).toBeLessThan(view.w)
    expect(r.h / r.w).toBeCloseTo(view.h / view.w, 1)
    expect(r.x + r.w / 2).toBeCloseTo(440, 0)
  })
  it("never zooms in past maxZoom", () => {
    const r = fitRect(view, [{ x: 440, y: 300 }], 0, 1.7)!
    expect(r.w).toBeCloseTo(view.w / 1.7, 0)
  })
  it("never frames wider than the default padded stage", () => {
    const r = fitRect(view, [{ x: -5000, y: 0 }, { x: 5000, y: 0 }], 80, 1.7)!
    expect(r.w).toBeCloseTo(view.w * 1.12, 0)
  })
})
