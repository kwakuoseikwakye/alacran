import { HOT_DESKS, YOUR_DESK, type Room } from "./types"

/** Every distance here is in Kenney furniture tiles: a wall tile is 1 wide and 1.29 tall. */
export const ROOM_MIN_W = 4.4
export const ROOM_D = 3.2
export const INNER_D = 1.0
export const CORRIDOR_D = 1.2
export const FRONT_D = 3.4
export const AISLE_W = 1.0
/** Kitchen 2.6 + lounge 4.2 + hot desks 4.4 + your desk 3.4. */
export const FRONT_W = 14.6
/** A desk chair's distance from the wall behind its desk. */
export const SEAT_OFFSET = 0.98
const MAX_ROWS = 3
const MAX_COLS = 4
/** A short first row still reserves three room widths, so a lone HQ is not stretched across the office. */
const MIN_SLOTS = 3

export type SpotKind = "seat" | "sofa" | "coffee" | "window" | "stand" | "queue" | "overflow" | "entrance"
export type Spot = { node: string; x: number; z: number; yaw: number; kind: SpotKind; roomId: string | null }
export type Rect = { x0: number; x1: number; z0: number; z1: number }
export type RoomPlan = Rect & { room: Room; row: number; col: number; door: string; seats: string[]; overflow: string }
export type OfficePlan = {
  width: number
  depth: number
  rows: number
  slots: number
  rooms: RoomPlan[]
  emptySlots: Rect[]
  roomsDepth: number
  corridorZ: number
  /** The corridor in front of row r (r ≥ 1) is at index r - 1. */
  innerCorridorZ: number[]
  aisleX: number | null
  front: { z0: number; kitchen: Rect; lounge: Rect; hot: Rect; you: Rect }
  hotSeats: string[]
  hotOverflow: string
  queue: string[]
  queueOverflow: string
  idleSpots: string[]
  entrance: string
  spots: Record<string, Spot>
  nodes: Record<string, { x: number; z: number }>
  edges: [string, string][]
}

/** Rooms per row, front row first: at most 3 rows of 4, as even as possible. */
export function rowCounts(n: number): number[] {
  if (n <= 0) return [0]
  const rows = Math.min(MAX_ROWS, Math.ceil(n / MAX_COLS))
  const base = Math.floor(n / rows)
  const extra = n % rows
  return Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0))
}

/**
 * The office floor for a room list. The same rooms always give the same plan.
 * x runs left to right, z from the back wall (0) to the front edge (depth).
 */
export function planOffice(rooms: Room[]): OfficePlan {
  const counts = rowCounts(rooms.length)
  const rows = counts.length
  const slots = Math.max(MIN_SLOTS, ...counts)
  const aisle = rows > 1 ? AISLE_W : 0
  const width = Math.max(FRONT_W, slots * ROOM_MIN_W + aisle)
  const roomW = (width - aisle) / slots
  const roomsDepth = rows * ROOM_D + (rows - 1) * INNER_D
  const corridorZ = roomsDepth + CORRIDOR_D / 2
  const zF = roomsDepth + CORRIDOR_D
  const depth = zF + FRONT_D
  const k = width / FRONT_W
  const xs = (v: number) => v * k

  const nodes: OfficePlan["nodes"] = {}
  const spots: OfficePlan["spots"] = {}
  const edges: [string, string][] = []
  const node = (id: string, x: number, z: number): string => {
    nodes[id] = { x, z }
    return id
  }
  const spot = (id: string, x: number, z: number, yaw: number, kind: SpotKind, roomId: string | null = null): string => {
    node(id, x, z)
    spots[id] = { node: id, x, z, yaw, kind, roomId }
    return id
  }
  const link = (a: string, b: string): void => {
    edges.push([a, b])
  }

  const rowZ0 = (r: number) => (rows - 1 - r) * (ROOM_D + INNER_D)
  const innerCorridorZ = Array.from({ length: rows - 1 }, (_, i) => rowZ0(i + 1) + ROOM_D + INNER_D / 2)
  const hallZ = (r: number) => (r === 0 ? corridorZ : innerCorridorZ[r - 1])
  /** Nodes along each corridor; index r is the corridor row r's doors open onto. */
  const stops: string[][] = Array.from({ length: rows }, () => [])

  // Rooms: front row (r = 0) first, left to right.
  const roomPlans: RoomPlan[] = []
  const emptySlots: Rect[] = []
  let next = 0
  for (let r = 0; r < rows; r++) {
    const z0 = rowZ0(r)
    const z1 = z0 + ROOM_D
    for (let c = 0; c < slots; c++) {
      const x0 = c * roomW
      const x1 = x0 + roomW
      if (c >= counts[r]) {
        emptySlots.push({ x0, x1, z0, z1 })
        continue
      }
      const room = rooms[next++]
      const cx = (x0 + x1) / 2
      const door = node(`${room.id}:door`, cx, z1)
      const hall = node(`${room.id}:hall`, cx, hallZ(r))
      const mid = node(`${room.id}:mid`, cx, z1 - 0.9)
      link(hall, door)
      link(door, mid)
      stops[r].push(hall)
      const seats: string[] = []
      for (let i = 0; i < 2; i++) {
        const x = x0 + (roomW * (i + 1)) / 3
        const seat = spot(`${room.id}:seat:${i}`, x, z0 + SEAT_OFFSET, Math.PI, "seat", room.id)
        const approach = node(`${seat}:a`, x, z0 + SEAT_OFFSET + 0.85)
        link(mid, approach)
        link(approach, seat)
        seats.push(seat)
      }
      const overflow = spot(`${room.id}:overflow`, cx, z1 - 0.5, 0, "overflow", room.id)
      link(mid, overflow)
      roomPlans.push({ room, row: r, col: c, x0, x1, z0, z1, door, seats, overflow })
    }
  }

  // Front zone: kitchen, lounge, hot desks, your desk, entrance.
  const kitchen: Rect = { x0: 0, x1: xs(2.6), z0: zF, z1: depth }
  const lounge: Rect = { x0: xs(2.6), x1: xs(6.8), z0: zF, z1: depth }
  const hot: Rect = { x0: xs(6.8), x1: xs(11.2), z0: zF, z1: depth }
  const you: Rect = { x0: xs(11.2), x1: width, z0: zF, z1: depth }

  const kitchenHall = node("kitchen:hall", 1.75, corridorZ)
  const kitchenA = node("kitchen:a", 1.75, zF + 0.95)
  const coffee = spot("kitchen:coffee", 0.95, zF + 0.95, -Math.PI / 2, "coffee")
  const kitchenB = node("kitchen:b", 1.75, zF + 2.75)
  const windowSpot = spot("kitchen:window", 0.6, zF + 2.75, -Math.PI / 2, "window")
  link(kitchenHall, kitchenA)
  link(kitchenA, coffee)
  link(kitchenA, kitchenB)
  link(kitchenB, windowSpot)
  stops[0].push(kitchenHall)

  const sofaX = xs(4.7)
  const loungeHall = node("lounge:hall", xs(2.95), corridorZ)
  const loungeSide = node("lounge:side", xs(2.95), zF + 1.38)
  link(loungeHall, loungeSide)
  link(kitchenB, loungeSide)
  stops[0].push(loungeHall)
  let previous = loungeSide
  const sofaOffsets = [-0.42, 0.42]
  for (let i = 0; i < sofaOffsets.length; i++) {
    const seat = spot(`lounge:sofa:${i}`, sofaX + sofaOffsets[i], zF + 0.75, 0, "sofa")
    const approach = node(`${seat}:a`, sofaX + sofaOffsets[i], zF + 1.38)
    link(previous, approach)
    link(approach, seat)
    previous = approach
  }
  link(previous, spot("lounge:stand", xs(6.25), zF + 2.65, 0, "stand"))

  const hotHall = node("hot:hall", hot.x0 + 0.3, corridorZ)
  const hotAisle = node("hot:aisle", hot.x0 + 0.3, zF + 1.85)
  link(hotHall, hotAisle)
  stops[0].push(hotHall)
  const hx0 = hot.x0 + 0.6
  const hx1 = hot.x1 - 0.1
  const hotSeats: string[] = []
  let lastApproach = hotAisle
  for (let i = 0; i < 4; i++) {
    const x = hx0 + ((i + 0.5) * (hx1 - hx0)) / 4
    const seat = spot(`hot:seat:${i}`, x, zF + SEAT_OFFSET, Math.PI, "seat", HOT_DESKS)
    const approach = node(`${seat}:a`, x, zF + 1.85)
    link(lastApproach, approach)
    link(approach, seat)
    lastApproach = approach
    hotSeats.push(seat)
  }
  const hotOverflow = spot("hot:overflow", (hx0 + hx1) / 2, zF + 2.7, 0, "overflow", HOT_DESKS)
  link(hotAisle, hotOverflow)

  const deskX = xs(12.9)
  const youHall = node("you:hall", xs(11.35), corridorZ)
  const youA = node("you:a", xs(11.35), zF + 1.9)
  link(youHall, youA)
  link(lastApproach, youA)
  stops[0].push(youHall)
  const queueAt: [number, number][] = [
    [deskX - 0.75, zF + 2.0],
    [deskX + 0.05, zF + 2.15],
    [deskX + 0.8, zF + 2.0],
    [deskX - 0.35, zF + 2.75],
  ]
  const queue = queueAt.map(([x, z], i) => {
    const q = spot(`you:q:${i}`, x, z, 0, "queue", YOUR_DESK)
    link(youA, q)
    return q
  })
  const queueOverflow = spot("you:overflow", deskX + 0.45, zF + 2.95, 0, "overflow", YOUR_DESK)
  link(youA, queueOverflow)
  const entrance = spot("entrance", width - 0.6, depth - 0.45, Math.PI, "entrance")
  link(youA, entrance)

  // Corridors: chain every stop left to right; inner corridors reach the main one by the aisle.
  for (let r = 0; r < rows; r++) {
    stops[r].push(node(r === 0 ? "main:w" : `inner:${r}:w`, 0.55, hallZ(r)))
    if (aisle) {
      const a = node(`aisle:${r}`, width - AISLE_W / 2, hallZ(r))
      stops[r].push(a)
      if (r > 0) link(`aisle:${r - 1}`, a)
    } else if (r === 0) {
      stops[r].push(node("main:e", width - 0.55, corridorZ))
    }
    const ordered = [...new Set(stops[r])].sort((a, b) => nodes[a].x - nodes[b].x)
    for (let i = 1; i < ordered.length; i++) link(ordered[i - 1], ordered[i])
  }

  return {
    width,
    depth,
    rows,
    slots,
    rooms: roomPlans,
    emptySlots,
    roomsDepth,
    corridorZ,
    innerCorridorZ,
    aisleX: aisle ? width - AISLE_W / 2 : null,
    front: { z0: zF, kitchen, lounge, hot, you },
    hotSeats,
    hotOverflow,
    queue,
    queueOverflow,
    idleSpots: ["lounge:sofa:0", "lounge:sofa:1", coffee, windowSpot, "lounge:stand"],
    entrance,
    spots,
    nodes,
    edges,
  }
}

const adjacency = new WeakMap<OfficePlan, Map<string, string[]>>()

function neighbours(plan: OfficePlan): Map<string, string[]> {
  let map = adjacency.get(plan)
  if (!map) {
    map = new Map()
    for (const [a, b] of plan.edges) {
      map.set(a, [...(map.get(a) ?? []), b])
      map.set(b, [...(map.get(b) ?? []), a])
    }
    adjacency.set(plan, map)
  }
  return map
}

/** Shortest walk between two nodes: the nodes after `from`, ending at `to`. Empty when already there. */
export function route(plan: OfficePlan, from: string, to: string): string[] {
  if (from === to) return []
  const map = neighbours(plan)
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string>()
  const open = new Set([from])
  while (open.size) {
    let current = ""
    let best = Infinity
    for (const id of open) {
      const d = dist.get(id)!
      if (d < best) {
        best = d
        current = id
      }
    }
    open.delete(current)
    if (current === to) break
    for (const next of map.get(current) ?? []) {
      const a = plan.nodes[current]
      const b = plan.nodes[next]
      const d = best + Math.hypot(b.x - a.x, b.z - a.z)
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d)
        prev.set(next, current)
        open.add(next)
      }
    }
  }
  if (!prev.has(to)) return []
  const path: string[] = []
  for (let id: string | undefined = to; id !== undefined && id !== from; id = prev.get(id)) path.unshift(id)
  return path
}
