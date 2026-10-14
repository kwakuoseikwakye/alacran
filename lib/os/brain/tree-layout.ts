/**
 * Organic tree layout for the focused G-Brain department.
 *
 * When a department is selected we stop drawing it as concentric rings and grow
 * it as a real tree, from the bottom up: the department is the trunk's base,
 * its SOP tasks are the main limbs, each task's single worker (an agent or a
 * human — monogamous, one per task) sits directly above it, and the tools that
 * worker uses are the leaves in the canopy. Skeleton branches lean at most
 * ~45° off vertical so the joints read as a tree that grew, not a right-angled
 * diagram; the canopy gets a de-overlap sweep so leaves never crowd.
 *
 * Pure + deterministic: no React, no DB. The component feeds these positions to
 * the force simulation as glide targets and draws the branches with `branchPath`.
 */

export type Pt = { x: number; y: number }

export type TreeNodePos = { x: number; y: number; depth: number }

/** A skeleton branch (trunk → branch → leaf). Angle-capped at ≤45° from vertical. */
export type TreeBranch = { source: string; target: string; depth: number; dashed?: boolean }

export type TreeLayoutInput = {
  selfId: string
  teamId: string
  /** the department-head node — the junction the SOP limbs fan out from */
  headId?: string
  /** the focused team's SOP task nodes, in display order */
  taskIds: string[]
  /** taskId → the single worker (agent or person) who does it — monogamous */
  workerByTask: Record<string, string>
  /** workerId → the tool ids that worker uses */
  toolsByWorker: Record<string, string[]>
  width: number
  height: number
  /** horizontal breathing room kept at each edge (default 70) */
  margin?: number
}

export type TreeLayoutResult = {
  positions: Map<string, TreeNodePos>
  /** the tree skeleton — each ≤45° off vertical */
  branches: TreeBranch[]
  /** shared-tool "also uses" vines (non-owner agent → tool); not angle-capped */
  extraLinks: { source: string; target: string }[]
}

// y for each depth as a fraction of canvas height: self (root) at the ground,
// a real trunk up to the department, then task limbs, the worker band directly
// above them, and the tool canopy along the top.
const DEPTH_FRAC = [0.86, 0.76, 0.5, 0.28, 0.09]

// fan tasks out to the full 45° cone so they're well-spread and readable
const CONE = 1.0
// spacing of the centralized tool shelf (shrinks evenly when a dept is dense)
const TOOL_SPACING = 90
// fraction of a pillar's half-slice the resting layout gives its agents/tools
const SECTOR_FILL = 0.84

const round2 = (n: number): number => {
  const v = Math.round(n * 100) / 100
  return Object.is(v, -0) ? 0 : v
}

/**
 * An organic curved branch from `a` (parent, lower) to `b` (child, higher):
 * it rises mostly vertically out of the parent, bends through the middle, then
 * eases vertically into the child — an S that looks grown, never a straight rod.
 */
export function branchPath(a: Pt, b: Pt): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const c1x = a.x + dx * 0.32
  const c1y = a.y + dy * 0.42
  const c2x = b.x - dx * 0.1
  const c2y = a.y + dy * 0.78
  return `M ${round2(a.x)} ${round2(a.y)} C ${round2(c1x)} ${round2(c1y)}, ${round2(c2x)} ${round2(c2y)}, ${round2(b.x)} ${round2(b.y)}`
}

/**
 * A gentle quadratic arc from `a` to `b`, bowed perpendicular to the chord by
 * `bow`×length — turns the unfocused graph's straight spokes into soft curves.
 */
export function edgeArc(a: Pt, b: Pt, bow = 0.12): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const off = bow * len
  const cx = mx + (-dy / len) * off
  const cy = my + (dx / len) * off
  return `M ${round2(a.x)} ${round2(a.y)} Q ${round2(cx)} ${round2(cy)}, ${round2(b.x)} ${round2(b.y)}`
}

/** Smooth trunk→leaf taper: branch stroke width by depth, monotonic, min 1. */
export function branchWidth(depth: number): number {
  return round2(Math.max(1, 3.6 - depth * 0.8))
}

export type RestLayoutInput = {
  selfId: string
  /** ordered pillars; tools must be deduped to one primary pillar each */
  pillars: { teamId: string; headId?: string; taskIds: string[]; workerIds: string[]; toolIds: string[] }[]
  /** radius per depth: [self, team, task, worker, tool]. Omit to derive from width/height. */
  ringR?: number[]
  cx: number
  cy: number
  /** angle of the first pillar (default straight up) */
  startAngle?: number
  /** canvas size — used to derive responsive ring radii when ringR is omitted */
  width?: number
  height?: number
}

export type RestLayoutResult = { positions: Map<string, Pt> }

const RING_FRAC = [0, 105 / 600, 152 / 600, 200 / 600, 248 / 600]

/** Responsive ring radii [self, team, task, worker, tool] for a given canvas size. */
export function responsiveRingR(width: number, height: number): number[] {
  const m = Math.max(1, Math.min(width, height))
  return RING_FRAC.map((f) => round2(f * m))
}

/**
 * The symmetric resting shape for the unfocused graph: self at the centre,
 * pillars evenly spaced around ring 1, and tasks, workers and tools balanced
 * within that pillar's angular sector.
 */
export function radialRestLayout(input: RestLayoutInput): RestLayoutResult {
  const { selfId, pillars, cx, cy } = input
  const startAngle = input.startAngle ?? -Math.PI / 2
  const ringR = input.ringR ?? responsiveRingR(input.width ?? 880, input.height ?? 600)
  const positions = new Map<string, Pt>()
  const polar = (r: number, a: number): Pt => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })

  positions.set(selfId, { x: cx, y: cy })

  const n = Math.max(1, pillars.length)
  const weights = pillars.map((p) => Math.max(1, p.taskIds.length + p.workerIds.length + p.toolIds.length))
  const total = weights.reduce((s, w) => s + w, 0) || 1
  const spans = weights.map((w) => (w / total) * Math.PI * 2)
  const centersRaw: number[] = []
  let cum = 0
  for (let i = 0; i < n; i++) {
    centersRaw[i] = cum + spans[i] / 2
    cum += spans[i]
  }
  const offset = startAngle - (centersRaw[0] ?? 0)

  pillars.forEach((p, i) => {
    const center = centersRaw[i] + offset
    positions.set(p.teamId, polar(ringR[1], center))
    if (p.headId) positions.set(p.headId, polar((ringR[1] + ringR[2]) / 2, center))
    const half = (spans[i] / 2) * SECTOR_FILL
    const ring = (ids: string[], r: number) => {
      const k = ids.length
      ids.forEach((id, j) => {
        const t = k <= 1 ? 0 : (j / (k - 1)) * 2 - 1
        positions.set(id, polar(r, center + t * half))
      })
    }
    ring(p.taskIds, ringR[2])
    ring(p.workerIds, ringR[3])
    ring(p.toolIds, ringR[4])
  })

  return { positions }
}

export function treeLayout(input: TreeLayoutInput): TreeLayoutResult {
  const { selfId, teamId, headId, taskIds, workerByTask, toolsByWorker, width: W, height: H } = input
  const margin = input.margin ?? 70
  const cx = W / 2
  const yOf = (depth: number) => H * DEPTH_FRAC[depth]
  const clampX = (x: number) => Math.max(margin, Math.min(W - margin, x))

  const positions = new Map<string, TreeNodePos>()
  const branches: TreeBranch[] = []
  const extraLinks: { source: string; target: string }[] = []

  positions.set(selfId, { x: cx, y: yOf(0), depth: 0 })
  positions.set(teamId, { x: cx, y: yOf(1), depth: 1 })
  branches.push({ source: selfId, target: teamId, depth: 1 })

  if (headId) {
    positions.set(headId, { x: cx, y: (yOf(1) + yOf(2)) / 2, depth: 1.5 })
    branches.push({ source: teamId, target: headId, depth: 2, dashed: true })
  }
  const limbSource = headId ?? teamId
  const limbSourceY = headId ? (yOf(1) + yOf(2)) / 2 : yOf(1)

  const taskY = yOf(2)
  const workerY = yOf(3)
  const n = taskIds.length
  const taskX = new Map<string, number>()
  taskIds.forEach((id, i) => {
    const dy = limbSourceY - taskY
    const half = Math.min(W / 2 - margin, dy * CONE)
    const t = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1
    const x = clampX(cx + t * half)
    taskX.set(id, x)
    positions.set(id, { x, y: taskY, depth: 2 })
    branches.push({ source: limbSource, target: id, depth: 2 })
  })

  const workerX = new Map<string, number>()
  const workerIds: string[] = []
  for (const taskId of taskIds) {
    const w = workerByTask[taskId]
    if (!w) continue
    const x = taskX.get(taskId) ?? cx
    workerX.set(w, x)
    workerIds.push(w)
    positions.set(w, { x, y: workerY, depth: 3 })
    branches.push({ source: taskId, target: w, depth: 3 })
  }

  const owner = new Map<string, string>()
  const usersOf = new Map<string, string[]>()
  for (const id of workerIds) {
    for (const tool of toolsByWorker[id] ?? []) {
      const users = usersOf.get(tool) ?? usersOf.set(tool, []).get(tool)!
      if (!users.includes(id)) users.push(id)
      if (!owner.has(tool)) owner.set(tool, id)
    }
  }

  const toolBandY = yOf(4)
  const toolIds = [...owner.keys()].sort((a, b) => {
    const ax = workerX.get(owner.get(a)!) ?? cx
    const bx = workerX.get(owner.get(b)!) ?? cx
    return ax - bx || a.localeCompare(b)
  })
  const k = toolIds.length
  const spacing = k <= 1 ? 0 : Math.min(TOOL_SPACING, (W - 2 * margin) / (k - 1))
  toolIds.forEach((tool, i) => {
    const x = clampX(cx + (i - (k - 1) / 2) * spacing)
    positions.set(tool, { x: round2(x), y: toolBandY, depth: 4 })
    branches.push({ source: owner.get(tool)!, target: tool, depth: 4 })
  })

  for (const [tool, users] of usersOf) {
    const primary = owner.get(tool)
    for (const u of users) if (u !== primary) extraLinks.push({ source: u, target: tool })
  }

  return { positions, branches, extraLinks }
}

export type FocusWheel = { hub: Pt; scale: number; stage: number; squeeze: number }

export function focusWheel(width: number, height: number, ringR: number[]): FocusWheel {
  const hub = { x: width / 2, y: height * 1.3 }
  const teamBandY = height * DEPTH_FRAC[1]
  const scale = (hub.y - teamBandY) / Math.max(1, ringR[1])
  return { hub, scale, stage: -Math.PI / 2, squeeze: 0.45 }
}

export function wheelPoint(rest: Pt, homeCenter: Pt, fw: FocusWheel, wheelAngle: number): Pt {
  const raw = Math.atan2(rest.y - homeCenter.y, rest.x - homeCenter.x) + wheelAngle
  const a = fw.stage + shortestAngleDelta(fw.stage, raw) * fw.squeeze
  const r = Math.hypot(rest.x - homeCenter.x, rest.y - homeCenter.y) * fw.scale
  return { x: fw.hub.x + r * Math.cos(a), y: fw.hub.y + r * Math.sin(a) }
}

export function cyclicDist(from: number, to: number, n: number): number {
  let d = (to - from) % n
  if (d > n / 2) d -= n
  if (d <= -n / 2) d += n
  return d
}

export function cyclicDeltaF(from: number, to: number, n: number): number {
  let d = (to - from) % n
  if (d < 0) d += n
  if (d > n / 2) d -= n
  return d
}

const RIM_EDGE_INSET = 76
const RIM_DROP_FRAC = 0.13

export function wheelStageDelta(width: number, height: number): number {
  const dx = width / 2 - RIM_EDGE_INSET
  const dy = height * RIM_DROP_FRAC
  const R = (dx * dx + dy * dy) / (2 * dy)
  return Math.asin(dx / R)
}

export function wheelStageGeom(width: number, height: number): { hub: Pt; R: number; delta: number } {
  const apexY = height * DEPTH_FRAC[1]
  const dx = width / 2 - RIM_EDGE_INSET
  const dy = height * RIM_DROP_FRAC
  const R = (dx * dx + dy * dy) / (2 * dy)
  return { hub: { x: width / 2, y: apexY + R }, R, delta: Math.asin(dx / R) }
}

export function wheelStageSpot(offset: number, width: number, height: number): Pt {
  const { hub, R, delta } = wheelStageGeom(width, height)
  const a = -Math.PI / 2 + offset * delta
  return { x: round2(hub.x + R * Math.cos(a)), y: round2(hub.y + R * Math.sin(a)) }
}

export function rotateAbout(p: Pt, c: Pt, theta: number): Pt {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

export function shortestAngleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI)
  if (d > Math.PI) d -= 2 * Math.PI
  if (d <= -Math.PI) d += 2 * Math.PI
  return d
}
