import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { Director, type Person } from "./director"
import { planOffice } from "./plan"
import type { Office, Resident, Room, Worker } from "./types"

/** Small seeded generator so wandering is repeatable. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HQ: Room = { id: "hq", kind: "hq", name: "HQ", color: "#64748b", glyph: "⌂" }
const MKT: Room = { id: "team:marketing", kind: "team", name: "Marketing", color: "#ec4f88", glyph: "✦" }
const plan = planOffice([HQ, MKT])
const CLAUDE: Resident = { executorId: "claude-code", name: "Claude", color: "#d9774f" }

function worker(id: string, over: Partial<Worker> = {}): Worker {
  return { id, label: `Job ${id}`, state: "working", startedAt: null, href: "/x", executorId: "claude-code", roomId: "team:marketing", ...over }
}

function office(workers: Worker[], residents: Resident[] = [CLAUDE]): Office {
  return { desks: [{ id: "runs", workers }], rooms: [HQ, MKT], moreRooms: 0, residents, summary: "", checkedAt: "" }
}

/** A director that has already had its first, settling update with nobody working. */
function started(seed: number, residents: Resident[] = [CLAUDE], options: { reducedMotion?: boolean } = {}): Director {
  const director = new Director(plan, { rng: mulberry32(seed), ...options })
  director.sync(office([], residents), 0)
  return director
}

function run(director: Director, from: number, seconds = 40): number {
  let now = from
  for (let i = 0; i < seconds * 20; i++) {
    now += 50
    director.step(0.05, now)
  }
  return now
}

const who = (director: Director, id: string) => director.people.find((p) => p.id === id) as Person

describe("Director", () => {
  it("gives each AI one resident, idling at a free spot", () => {
    const d = started(1, [CLAUDE, { executorId: "codex", name: "Codex", color: "#f1f1ee" }])
    expect(d.people.map((p) => p.id)).toEqual(["res:claude-code", "res:codex"])
    expect(new Set(d.people.map((p) => p.spot)).size).toBe(2)
    expect(d.people.every((p) => plan.idleSpots.includes(p.spot))).toBe(true)
  })

  it("places everyone at their goals on the first update, without walking", () => {
    const d = new Director(plan, { rng: mulberry32(2) })
    d.sync(office([worker("w1")]), 0)
    const claude = who(d, "res:claude-code")
    expect(plan.rooms[1].seats).toContain(claude.spot)
    expect(claude).toMatchObject({ walking: false, path: [], opacity: 1, posture: "sit" })
    expect(claude.x).toBeCloseTo(plan.spots[claude.spot].x)
  })

  it("walks the AI to a free desk in the job's room, where it sits", () => {
    const d = started(3)
    d.sync(office([worker("w1")]), 0)
    expect(who(d, "res:claude-code").walking).toBe(true)
    run(d, 0)
    const claude = who(d, "res:claude-code")
    expect(plan.rooms[1].seats).toContain(claude.spot)
    expect(claude.walking).toBe(false)
    expect(claude.posture).toBe("sit")
    expect(claude.z).toBeCloseTo(plan.spots[claude.spot].z)
  })

  it("keeps the same person and desk across updates", () => {
    const d = started(4)
    d.sync(office([worker("w1")]), 0)
    const now = run(d, 0)
    const seat = who(d, "res:claude-code").spot
    d.sync(office([worker("w1")]), now)
    expect(who(d, "res:claude-code").spot).toBe(seat)
    expect(d.people).toHaveLength(1)
  })

  it("brings in an extra person for a second job of the same AI, who fades in at the entrance", () => {
    const d = started(5)
    d.sync(office([worker("w1"), worker("w2")]), 0)
    const extra = who(d, "extra:w2")
    expect(extra.kind).toBe("extra")
    expect(extra.opacity).toBe(0)
    expect(extra.node).toBe(plan.entrance)
    run(d, 0)
    expect(extra.opacity).toBe(1)
    expect(extra.spot).not.toBe(who(d, "res:claude-code").spot)
    expect(plan.rooms[1].seats).toContain(extra.spot)
  })

  it("gives two jobs and an approval for one AI three people in three different places", () => {
    const d = started(6)
    d.sync(office([worker("w1"), worker("w2"), worker("a", { state: "waiting", roomId: "your-desk" })]), 0)
    expect(d.people).toHaveLength(3)
    expect(new Set(d.people.map((p) => p.spot)).size).toBe(3)
    expect(who(d, "extra:a").spot).toBe(plan.queue[0])
  })

  it("sends a resident back to idling and an extra out of the door when their jobs end", () => {
    const d = started(7)
    d.sync(office([worker("w1"), worker("w2")]), 0)
    let now = run(d, 0)
    d.sync(office([]), now)
    expect(who(d, "res:claude-code").state).toBe("idle")
    expect(who(d, "extra:w2").state).toBe("leaving")
    now = run(d, now)
    expect(d.people.map((p) => p.id)).toEqual(["res:claude-code"])
    expect(plan.idleSpots).toContain(who(d, "res:claude-code").spot)
  })

  it("queues waiting work at your desk in the order it arrived, carrying the paper and waving", () => {
    const d = started(8)
    d.sync(office([worker("a", { state: "waiting", roomId: "your-desk" }), worker("b", { state: "waiting", roomId: "your-desk" })]), 0)
    expect(who(d, "res:claude-code").spot).toBe(plan.queue[0])
    expect(who(d, "extra:b").spot).toBe(plan.queue[1])
    expect(who(d, "res:claude-code")).toMatchObject({ posture: "wave", carry: "paper" })
  })

  it("leaves failed work slumped at its desk", () => {
    const d = started(9)
    d.sync(office([worker("w1")]), 0)
    const now = run(d, 0)
    const seat = who(d, "res:claude-code").spot
    d.sync(office([worker("w1", { state: "failed" })]), now)
    expect(who(d, "res:claude-code")).toMatchObject({ spot: seat, posture: "slump" })
  })

  it("uses the hot desks for a room the plan does not have", () => {
    const d = started(10)
    d.sync(office([worker("w1", { roomId: "dept:nowhere" })]), 0)
    expect(plan.hotSeats).toContain(who(d, "res:claude-code").spot)
  })

  it("never lets two people hold the same spot while they wander", () => {
    const residents = ["claude-code", "codex", "kimi", "kiro"].map((executorId) => ({ executorId, name: executorId, color: "#000000" }))
    const d = started(11, residents)
    let now = 0
    for (let i = 0; i < 4000; i++) {
      now += 50
      d.step(0.05, now)
      const held = d.people.filter((p) => !p.walking).map((p) => p.spot)
      expect(new Set(held).size).toBe(held.length)
    }
  })

  it("moves an idle resident on within 8 to 20 seconds of arriving", () => {
    const d = started(12)
    const now = run(d, 0, 30)
    const first = who(d, "res:claude-code").spot
    run(d, now, 25)
    expect(who(d, "res:claude-code").spot).not.toBe(first)
  })

  it("moves people without walking when motion is reduced", () => {
    const d = started(13, [CLAUDE], { reducedMotion: true })
    d.sync(office([worker("w1")]), 0)
    const claude = who(d, "res:claude-code")
    expect(claude.path).toEqual([])
    expect(claude.x).toBeCloseTo(plan.spots[claude.spot].x)
    expect(claude.opacity).toBe(0)
    d.step(0.5, 500)
    expect(claude.opacity).toBe(1)
  })

  it("carries everyone into a new floor plan, so work in a room that just opened is walked to", () => {
    const before = started(18)
    const spot = who(before, "res:claude-code").spot
    const FIN: Room = { id: "dept:finances", kind: "department", name: "Finances", color: "#10b981", glyph: "#" }
    const wider = planOffice([HQ, MKT, FIN])
    const after = new Director(wider, { rng: mulberry32(18), from: before })
    const claude = who(after, "res:claude-code")
    expect(claude).toMatchObject({ spot, walking: false })
    expect(claude.x).toBeCloseTo(wider.spots[spot].x)
    after.sync(office([worker("w1", { roomId: "dept:finances" })]), 0)
    expect(claude.walking).toBe(true)
    expect(wider.rooms[2].seats).toContain(claude.spot)
  })

  it("starts someone whose spot is gone from the entrance of the new plan", () => {
    const before = new Director(plan, { rng: mulberry32(19) })
    before.sync(office([worker("w1")]), 0)
    const smaller = planOffice([HQ])
    const after = new Director(smaller, { rng: mulberry32(19), from: before })
    expect(who(after, "res:claude-code")).toMatchObject({ node: smaller.entrance, spot: smaller.entrance, walking: false })
  })

  it("finishes the stretch it is walking before turning, so nobody cuts through furniture", () => {
    const d = started(17)
    d.sync(office([worker("w1")]), 0)
    d.step(0.1, 100)
    const claude = who(d, "res:claude-code")
    const heading = claude.path[0].node
    d.sync(office([worker("w1", { state: "waiting", roomId: "your-desk" })]), 100)
    expect(claude.path[0].node).toBe(heading)
    expect(claude.path.at(-1)?.node).toBe(plan.queue[0])
  })

  it("keeps an idle resident at each spot for 8 to 20 seconds when motion is reduced", () => {
    const d = started(16, [CLAUDE], { reducedMotion: true })
    let spot = who(d, "res:claude-code").spot
    const moves: number[] = []
    let now = 0
    for (let i = 0; i < 1200; i++) {
      now += 50
      d.step(0.05, now)
      const at = who(d, "res:claude-code").spot
      if (at !== spot) {
        moves.push(now)
        spot = at
      }
    }
    const gaps = moves.slice(1).map((t, i) => t - moves[i])
    expect(gaps.length).toBeGreaterThan(0)
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(8_000)
  })

  it("turns a leaving person round when their job comes straight back, so no two people share an id", () => {
    const d = started(20)
    d.sync(office([worker("w1"), worker("w2")]), 0)
    const now = run(d, 0)
    d.sync(office([worker("w1")]), now)
    expect(who(d, "extra:w2").state).toBe("leaving")
    d.sync(office([worker("w1"), worker("w2")]), now + 100)
    expect(d.people.filter((p) => p.id === "extra:w2")).toHaveLength(1)
    expect(who(d, "extra:w2").state).toBe("working")
  })

  it("walks a resident out once the company stops using that AI", () => {
    const codex: Resident = { executorId: "codex", name: "Codex", color: "#f1f1ee" }
    const d = started(21, [CLAUDE, codex])
    d.sync(office([], [CLAUDE]), 0)
    expect(who(d, "res:codex").state).toBe("leaving")
    run(d, 0)
    expect(d.people.map((p) => p.id)).toEqual(["res:claude-code"])
  })

  it("turns a departing resident round if its AI comes back", () => {
    const codex: Resident = { executorId: "codex", name: "Codex", color: "#f1f1ee" }
    const d = started(22, [CLAUDE, codex])
    d.sync(office([], [CLAUDE]), 0)
    d.sync(office([], [CLAUDE, codex]), 100)
    expect(who(d, "res:codex").state).toBe("idle")
    expect(plan.idleSpots).toContain(who(d, "res:codex").spot)
  })

  it("does not depend on rendering, so a theme switch cannot reset anyone", () => {
    expect(readFileSync("lib/os/office/director.ts", "utf-8")).not.toMatch(/from "three/)
  })
})
