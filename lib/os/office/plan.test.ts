import { describe, it, expect } from "vitest"
import { FRONT_W, planOffice, route, rowCounts, type OfficePlan } from "./plan"
import type { Room } from "./types"

const room = (i: number): Room => ({
  id: i === 0 ? "hq" : `dept:d${i}`,
  kind: i === 0 ? "hq" : "department",
  name: `Room ${i}`,
  color: "#888888",
  glyph: "R",
})
const rooms = (n: number) => Array.from({ length: n }, (_, i) => room(i))

function reachableFrom(plan: OfficePlan, start: string): Set<string> {
  const adjacent = new Map<string, string[]>()
  for (const [a, b] of plan.edges) {
    adjacent.set(a, [...(adjacent.get(a) ?? []), b])
    adjacent.set(b, [...(adjacent.get(b) ?? []), a])
  }
  const seen = new Set([start])
  const queue = [start]
  while (queue.length) {
    for (const next of adjacent.get(queue.shift()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

describe("rowCounts", () => {
  it.each([
    [0, [0]],
    [1, [1]],
    [3, [3]],
    [4, [4]],
    [5, [3, 2]],
    [7, [4, 3]],
    [8, [4, 4]],
    [9, [3, 3, 3]],
    [10, [4, 3, 3]],
    [12, [4, 4, 4]],
  ])("%i rooms fill rows %j, front row first", (n, expected) => {
    expect(rowCounts(n)).toEqual(expected)
  })
})

describe("planOffice", () => {
  it.each(Array.from({ length: 13 }, (_, n) => n))("lays out %i rooms without overlaps, everything reachable", (n) => {
    const plan = planOffice(rooms(n))
    expect(plan.rooms).toHaveLength(n)
    expect(plan.width).toBeGreaterThanOrEqual(FRONT_W)
    for (const a of plan.rooms) {
      expect(a.x0).toBeGreaterThanOrEqual(0)
      expect(a.x1).toBeLessThanOrEqual(plan.width + 1e-9)
      expect(a.z0).toBeGreaterThanOrEqual(0)
      expect(a.z1).toBeLessThanOrEqual(plan.roomsDepth + 1e-9)
      for (const b of plan.rooms) {
        if (a === b) continue
        const apart = a.x1 <= b.x0 + 1e-9 || b.x1 <= a.x0 + 1e-9 || a.z1 <= b.z0 + 1e-9 || b.z1 <= a.z0 + 1e-9
        expect(apart).toBe(true)
      }
    }
    const reach = reachableFrom(plan, plan.entrance)
    for (const id of Object.keys(plan.spots)) expect(reach.has(id)).toBe(true)
    for (const r of plan.rooms) {
      expect(r.seats).toHaveLength(2)
      expect(reach.has(r.door)).toBe(true)
    }
    expect(plan.hotSeats).toHaveLength(4)
    expect(plan.queue).toHaveLength(4)
    expect(plan.idleSpots).toHaveLength(5)
  })

  it("is deterministic", () => {
    expect(planOffice(rooms(7))).toEqual(planOffice(rooms(7)))
  })

  it("stretches four rooms across the office at least the minimum width", () => {
    const plan = planOffice(rooms(4))
    for (const r of plan.rooms) expect(r.x1 - r.x0).toBeCloseTo(plan.width / 4)
  })

  it("leaves open floor beside a lone room instead of stretching it across the office", () => {
    const plan = planOffice(rooms(1))
    expect(plan.rooms[0].x1 - plan.rooms[0].x0).toBeCloseTo(plan.width / 3)
    expect(plan.emptySlots).toHaveLength(2)
  })

  it("puts back rows behind front rows, with an aisle to reach them", () => {
    const plan = planOffice(rooms(5))
    const front = plan.rooms.filter((r) => r.row === 0)
    const back = plan.rooms.filter((r) => r.row === 1)
    expect(front).toHaveLength(3)
    expect(back).toHaveLength(2)
    expect(Math.max(...back.map((r) => r.z1))).toBeLessThan(Math.min(...front.map((r) => r.z0)))
    expect(plan.aisleX).not.toBeNull()
  })
})

describe("route", () => {
  it("walks from the entrance into a room through its door", () => {
    const plan = planOffice(rooms(3))
    const target = plan.rooms[1].seats[0]
    const path = route(plan, plan.entrance, target)
    expect(path.at(-1)).toBe(target)
    expect(path).toContain(plan.rooms[1].door)
  })

  it("reaches a back-row room through the aisle", () => {
    const plan = planOffice(rooms(6))
    const back = plan.rooms.find((r) => r.row === 1)!
    const path = route(plan, plan.entrance, back.seats[1])
    expect(path).toContain("aisle:1")
    expect(path.at(-1)).toBe(back.seats[1])
  })

  it("is empty when already there", () => {
    const plan = planOffice(rooms(1))
    expect(route(plan, plan.entrance, plan.entrance)).toEqual([])
  })
})
