import { describe, it, expect } from "vitest"
import { liftLabels, type LabelBox } from "./labels"

/** A stack 100×50 (tag 80×20 plus bubble) anchored at x, y. */
const box = (id: string, x: number, y: number): LabelBox => ({ id, x, y, width: 100, height: 50, tag: { width: 80, height: 20 } })

function overlaps(boxes: LabelBox[], places: ReturnType<typeof liftLabels>): boolean {
  const rects = boxes.map((b) => {
    const place = places.get(b.id)!
    const { width, height } = place.bubble ? b : b.tag
    const bottom = b.y - place.lift
    return { x0: b.x - width / 2, x1: b.x + width / 2, y0: bottom - height, y1: bottom }
  })
  return rects.some((a, i) => rects.some((b, j) => i < j && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0))
}

describe("liftLabels", () => {
  it("leaves labels that do not touch where they are", () => {
    const places = liftLabels([box("a", 100, 200), box("b", 300, 200)])
    expect(places.get("a")).toEqual({ lift: 0, bubble: true })
    expect(places.get("b")).toEqual({ lift: 0, bubble: true })
  })

  it("lifts the label further from the viewer above the nearer one", () => {
    const places = liftLabels([box("far", 110, 195), box("near", 100, 200)])
    expect(places.get("near")?.lift).toBe(0)
    expect(places.get("far")?.lift).toBe(195 - (200 - 50 - 4))
  })

  it("stacks three people standing together so every name stays readable", () => {
    const boxes = [box("a", 100, 200), box("b", 100, 200), box("c", 104, 198)]
    const places = liftLabels(boxes)
    expect(overlaps(boxes, places)).toBe(false)
    expect(Math.min(...[...places.values()].map((p) => p.lift))).toBe(0)
  })

  it("gives the same answer for the same people in any order", () => {
    const boxes = [box("a", 100, 200), box("b", 100, 200)]
    expect(liftLabels(boxes)).toEqual(liftLabels([...boxes].reverse()))
  })

  it("drops the bubble of a stack that would leave the top of the stage, keeping its name", () => {
    const boxes = [box("near", 100, 100), box("far", 100, 98)]
    const places = liftLabels(boxes, 0)
    expect(places.get("near")).toEqual({ lift: 0, bubble: true })
    expect(places.get("far")).toEqual({ lift: 98 - (100 - 50 - 4), bubble: false })
    expect(overlaps(boxes, places)).toBe(false)
  })

  it("keeps every name on the stage when a crowd cannot fit, overlapping rather than vanishing", () => {
    const boxes = ["a", "b", "c", "d", "e", "f"].map((id) => box(id, 100, 140))
    const places = liftLabels(boxes, 0)
    for (const b of boxes) {
      const place = places.get(b.id)!
      expect(b.y - place.lift - (place.bubble ? b.height : b.tag.height)).toBeGreaterThanOrEqual(0)
    }
  })
})
