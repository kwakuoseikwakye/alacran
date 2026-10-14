import { residentLook, type Office, type Worker } from "./types"
import { route, type OfficePlan, type SpotKind } from "./plan"

export type Posture = "stand" | "sit" | "slump" | "sofa" | "wave" | "coffee" | "look"
export type PersonState = "working" | "waiting" | "failed" | "idle" | "leaving"

export type Person = {
  id: string
  executorId: string
  name: string
  color: string
  kind: "resident" | "extra"
  workerId: string | null
  state: PersonState
  label: string | null
  href: string | null
  startedAt: string | null
  x: number
  z: number
  /** Facing in radians; the scene eases toward it. */
  yaw: number
  /** The node it last stood on. */
  node: string
  /** Remaining waypoints, nearest first. */
  path: { node: string; x: number; z: number }[]
  /** The spot it is heading to or holding. */
  spot: string
  /** What it does once it gets there. */
  posture: Posture
  walking: boolean
  /** Grows with distance walked; the scene turns it into leg swing. */
  walkPhase: number
  opacity: number
  carry: "paper" | null
  nextIdleAt: number
  gone: boolean
}

export type DirectorOptions = {
  rng?: () => number
  reducedMotion?: boolean
  /** The director for the previous floor plan: everyone carries over to where they stood. */
  from?: Director | null
}

const SPEED = 1.15
const STRIDE = 0.55
const FADE_PER_SECOND = 2.5
const IDLE_MIN_MS = 8_000
const IDLE_SPREAD_MS = 12_000
const IDLE_POSTURE: Partial<Record<SpotKind, Posture>> = { sofa: "sofa", coffee: "coffee", window: "look", stand: "look" }
/** Spots several people may share; every other spot holds one person. */
const SHARED: SpotKind[] = ["overflow", "entrance"]

/**
 * Turns office updates into people with goals, and moves them. Pure: no
 * rendering, no clock of its own (time comes in), randomness injected. The card
 * owns one per plan, so a scene rebuild (a theme switch) never resets anyone.
 */
export class Director {
  readonly people: Person[] = []
  private readonly claims = new Map<string, string>()
  private readonly rng: () => number
  private settled = false

  constructor(
    readonly plan: OfficePlan,
    private readonly options: DirectorOptions = {}
  ) {
    this.rng = options.rng ?? Math.random
    // A new plan (a room opened or closed) keeps everyone where they stood, by spot id, so work in
    // a room that just opened is walked to. Someone whose spot is gone starts at the entrance.
    if (options.from) {
      for (const old of options.from.people) {
        if (old.gone) continue
        const stood = old.walking ? old.node : old.spot
        const at = plan.nodes[stood] ? stood : plan.entrance
        const person: Person = { ...old, ...plan.nodes[at], node: at, spot: at, path: [], walking: false, yaw: plan.spots[at]?.yaw ?? old.yaw }
        if (old.walking && person.state === "idle") person.nextIdleAt = 0
        this.claim(person, at)
        this.people.push(person)
      }
      this.settled = true
    }
  }

  /** Reconcile with a fresh office: who exists, who is doing what, and where each should be. */
  sync(office: Office, now: number): void {
    for (const resident of office.residents) {
      const existing = this.people.find((p) => p.kind === "resident" && p.executorId === resident.executorId)
      if (existing) {
        // Its AI is back while it was walking out: turn it round.
        if (existing.state === "leaving") {
          existing.state = "idle"
          const back = this.freeSpot(this.plan.idleSpots) ?? this.plan.idleSpots[this.plan.idleSpots.length - 1]
          this.goTo(existing, back, this.idlePosture(back))
          existing.nextIdleAt = now + IDLE_MIN_MS
        }
        continue
      }
      const at = this.freeSpot(this.plan.idleSpots) ?? this.plan.idleSpots[this.plan.idleSpots.length - 1]
      const person = this.spawn(`res:${resident.executorId}`, resident.executorId, resident.name, resident.color, "resident", at, now)
      person.posture = this.idlePosture(at)
      this.claim(person, at)
      this.people.push(person)
    }

    const workers = office.desks.flatMap((d) => d.workers)
    const live = new Set(workers.map((w) => w.id))
    for (const p of this.people) if (p.workerId && !live.has(p.workerId)) this.release(p, now)

    const fallback = office.residents[0]?.executorId ?? "unknown"
    for (const w of workers) {
      let p = this.people.find((q) => q.workerId === w.id)
      if (!p) {
        const executorId = w.executorId ?? fallback
        p = this.people.find((q) => q.kind === "resident" && q.executorId === executorId && !q.workerId)
        if (!p) {
          // The same job back while its last person is still walking out: turn them round, so
          // no two people ever share an id. If another AI took the job, the old one goes at once.
          const old = this.people.find((q) => q.id === `extra:${w.id}`)
          if (old && old.executorId === executorId) p = old
          else {
            if (old) {
              this.unclaim(old)
              this.people.splice(this.people.indexOf(old), 1)
            }
            const look = residentLook(executorId)
            p = this.spawn(`extra:${w.id}`, executorId, look.name, look.color, "extra", this.plan.entrance, now)
            p.opacity = 0
            this.people.push(p)
          }
        }
        p.workerId = w.id
      }
      this.assign(p, w)
    }

    // An AI the company no longer uses walks out once it has nothing to do. No residents at all
    // means the office could not tell which AI the company uses, not that it uses none.
    if (office.residents.length) {
      const using = new Set(office.residents.map((r) => r.executorId))
      for (const p of this.people) {
        if (p.kind !== "resident" || using.has(p.executorId) || p.workerId || p.state === "leaving") continue
        p.state = "leaving"
        this.goTo(p, this.plan.entrance, "stand")
      }
    }

    // The first update (page load, or a new plan) shows the office as it is, with nobody walking in.
    if (!this.settled) {
      this.settled = true
      for (const p of this.people) this.place(p)
    }
  }

  /** Move everyone along by dt seconds. */
  step(dt: number, now: number): void {
    for (const p of this.people) {
      if (p.path.length) this.walk(p, dt, now)
      else if (p.state === "idle" && now >= p.nextIdleAt) this.wander(p, now)
      const target = p.state === "leaving" && !p.path.length ? 0 : 1
      const change = FADE_PER_SECOND * dt
      p.opacity = target > p.opacity ? Math.min(target, p.opacity + change) : Math.max(target, p.opacity - change)
      if (p.state === "leaving" && !p.path.length && p.opacity === 0) p.gone = true
    }
    for (let i = this.people.length - 1; i >= 0; i--) {
      if (this.people[i].gone) this.people.splice(i, 1)
    }
  }

  private spawn(id: string, executorId: string, name: string, color: string, kind: Person["kind"], at: string, now: number): Person {
    const point = this.plan.nodes[at]
    return {
      id,
      executorId,
      name,
      color,
      kind,
      workerId: null,
      state: "idle",
      label: null,
      href: null,
      startedAt: null,
      x: point.x,
      z: point.z,
      yaw: this.plan.spots[at]?.yaw ?? 0,
      node: at,
      path: [],
      spot: at,
      posture: "stand",
      walking: false,
      walkPhase: 0,
      opacity: 1,
      carry: null,
      nextIdleAt: now + 2_000 + this.rng() * 6_000,
      gone: false,
    }
  }

  private assign(p: Person, w: Worker): void {
    p.state = w.state
    p.label = w.label
    p.href = w.href
    p.startedAt = w.startedAt
    p.carry = w.state === "waiting" ? "paper" : null
    if (w.state === "waiting") {
      this.goTo(p, this.keepOrPick(p, this.plan.queue) ?? this.plan.queueOverflow, "wave")
      return
    }
    const room = this.plan.rooms.find((r) => r.room.id === w.roomId)
    const seat = this.keepOrPick(p, room ? room.seats : this.plan.hotSeats)
    if (seat) this.goTo(p, seat, w.state === "failed" ? "slump" : "sit")
    else this.goTo(p, room ? room.overflow : this.plan.hotOverflow, "stand")
  }

  private release(p: Person, now: number): void {
    p.workerId = null
    p.label = null
    p.href = null
    p.startedAt = null
    p.carry = null
    if (p.kind === "extra") {
      p.state = "leaving"
      this.goTo(p, this.plan.entrance, "stand")
      return
    }
    p.state = "idle"
    const at = this.freeSpot(this.plan.idleSpots) ?? this.plan.idleSpots[this.plan.idleSpots.length - 1]
    this.goTo(p, at, this.idlePosture(at))
    p.nextIdleAt = now + IDLE_MIN_MS
  }

  private wander(p: Person, now: number): void {
    const next = this.freeSpot(this.plan.idleSpots.filter((s) => s !== p.spot))
    if (next) this.goTo(p, next, this.idlePosture(next))
    // A walk sets the real dwell on arrival. A move with no walk (reduced motion) has already
    // arrived, so it gets its dwell now; 4 s only spaces out retries when every spot is taken.
    p.nextIdleAt = next && !p.walking ? now + IDLE_MIN_MS + this.rng() * IDLE_SPREAD_MS : now + 4_000
  }

  private walk(p: Person, dt: number, now: number): void {
    let budget = SPEED * dt
    while (budget > 0 && p.path.length) {
      const next = p.path[0]
      const dx = next.x - p.x
      const dz = next.z - p.z
      const distance = Math.hypot(dx, dz)
      const move = Math.min(distance, budget)
      if (distance > 1e-6) {
        p.yaw = Math.atan2(dx, dz)
        p.x += (dx / distance) * move
        p.z += (dz / distance) * move
      }
      p.walkPhase += (move / STRIDE) * Math.PI
      budget -= move
      if (move >= distance) {
        p.x = next.x
        p.z = next.z
        p.node = next.node
        p.path.shift()
      }
    }
    p.walking = p.path.length > 0
    if (!p.walking) {
      p.yaw = this.plan.spots[p.spot]?.yaw ?? p.yaw
      if (p.state === "idle") p.nextIdleAt = now + IDLE_MIN_MS + this.rng() * IDLE_SPREAD_MS
    }
  }

  private goTo(p: Person, at: string, posture: Posture): void {
    p.posture = posture
    if (p.spot === at) return
    this.unclaim(p)
    p.spot = at
    this.claim(p, at)
    if (this.options.reducedMotion) {
      this.place(p)
      p.opacity = 0
      return
    }
    // Mid-walk: finish the stretch being walked, then route on from its end, so the walk stays on the graph.
    const start = p.path.length ? p.path[0].node : p.node
    const ids = [...(p.path.length ? [start] : []), ...route(this.plan, start, at)]
    p.path = ids.map((id) => ({ node: id, ...this.plan.nodes[id] }))
    p.walking = p.path.length > 0
    if (!p.walking) this.place(p)
  }

  /** Put someone straight onto their spot, facing the right way. */
  private place(p: Person): void {
    const point = this.plan.nodes[p.spot]
    p.x = point.x
    p.z = point.z
    p.node = p.spot
    p.path = []
    p.walking = false
    p.opacity = p.state === "leaving" ? 0 : 1
    p.yaw = this.plan.spots[p.spot]?.yaw ?? p.yaw
  }

  private claim(p: Person, at: string): void {
    const kind = this.plan.spots[at]?.kind
    if (kind && !SHARED.includes(kind)) this.claims.set(at, p.id)
  }

  private unclaim(p: Person): void {
    if (this.claims.get(p.spot) === p.id) this.claims.delete(p.spot)
  }

  private freeSpot(candidates: string[]): string | null {
    const free = candidates.filter((c) => !this.claims.has(c))
    return free.length ? free[Math.floor(this.rng() * free.length)] : null
  }

  private keepOrPick(p: Person, candidates: string[]): string | null {
    if (candidates.includes(p.spot) && this.claims.get(p.spot) === p.id) return p.spot
    return candidates.find((c) => !this.claims.has(c)) ?? null
  }

  private idlePosture(at: string): Posture {
    const kind = this.plan.spots[at]?.kind
    return (kind && IDLE_POSTURE[kind]) || "look"
  }
}
