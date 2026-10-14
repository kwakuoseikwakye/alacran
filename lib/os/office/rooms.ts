import { residentLook, type Resident, type Room } from "./types"

/** A starter pack this company holds (lib/company-starter-packs.ts). */
export type InstalledPack = { id: string; label: string; category: string }

/** A department from lib/os/departments/registry.ts, reduced to what the office needs. */
export type DepartmentInfo = { slug: string; name: string; color: string; recordsCount: number }

export const HQ_ROOM: Room = { id: "hq", kind: "hq", name: "HQ", color: "#64748b", glyph: "⌂" }
export const MAX_ROOMS = 12

const TEAM_LOOKS: Record<string, { color: string; glyph: string }> = {
  Engineering: { color: "#4338ca", glyph: "</>" },
  Sales: { color: "#166534", glyph: "$" },
  Marketing: { color: "#c026d3", glyph: "✦" },
  Support: { color: "#ea580c", glyph: "?" },
  "HR & People": { color: "#7cb518", glyph: "♥" },
  Leadership: { color: "#b8a400", glyph: "★" },
}

const DEPARTMENT_GLYPHS: Record<string, string> = { funnel: "→", comms: "@", content: "¶", social: "↗", finances: "#" }

/** A lookup that sees only the table's own keys, so a folder named "constructor" is just a name. */
const own = <T>(table: Record<string, T>, key: string): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined)

/** A name's first letter or digit, for a sign: never a space or half a character. */
const initial = (name: string) => (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toUpperCase()

/** Letters and digits only, in any script, lower case: how names are compared. */
const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")

export const teamRoomId = (packId: string) => `team:${packId}`
export const departmentRoomId = (slug: string) => `dept:${slug}`

export function teamRoom(pack: InstalledPack): Room {
  const look = own(TEAM_LOOKS, pack.category) ?? { color: HQ_ROOM.color, glyph: initial(pack.category) }
  return { id: teamRoomId(pack.id), kind: "team", name: pack.category, color: look.color, glyph: look.glyph }
}

export function departmentRoom(d: DepartmentInfo): Room {
  return {
    id: departmentRoomId(d.slug),
    kind: "department",
    name: d.name,
    color: d.color,
    glyph: own(DEPARTMENT_GLYPHS, d.slug) ?? initial(d.name),
  }
}

/**
 * HQ, then installed teams, then departments that hold records or have someone
 * working in them, at most MAX_ROOMS. When there are too many, HQ always stays and
 * busy rooms go before idle ones (only past MAX_ROOMS - 1 busy rooms does a busy one
 * miss out), in the original order. A records folder named like a team (records/sales
 * beside the Sales team) is signed "Sales records", so no two signs read the same.
 */
export function buildRoomList(
  packs: InstalledPack[],
  departments: DepartmentInfo[],
  busyRoomIds: ReadonlySet<string>
): { rooms: Room[]; moreRooms: number } {
  const candidates: Room[] = [HQ_ROOM, ...packs.map(teamRoom)]
  const teamNames = new Set(candidates.filter((r) => r.kind === "team").map((r) => normalize(r.name)))
  for (const d of departments) {
    if (d.recordsCount === 0 && !busyRoomIds.has(departmentRoomId(d.slug))) continue
    const room = departmentRoom(d)
    candidates.push(teamNames.has(normalize(room.name)) ? { ...room, name: `${room.name} records` } : room)
  }
  if (candidates.length <= MAX_ROOMS) return { rooms: candidates, moreRooms: 0 }
  const order = new Map(candidates.map((room, i) => [room.id, i]))
  const keep = (room: Room) => room.id === HQ_ROOM.id || busyRoomIds.has(room.id)
  const rooms = [...candidates]
    .sort((a, b) => Number(keep(b)) - Number(keep(a)) || order.get(a.id)! - order.get(b.id)!)
    .slice(0, MAX_ROOMS)
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  return { rooms, moreRooms: candidates.length - rooms.length }
}

/**
 * The room a company command works in, read from the command's own output folder:
 * records/<slug>/… or notes/<slug>/… for a known department slug. notes/company/ is
 * the company's own notebook (sessions, messages), never a department, even if a
 * records/company folder exists. check-messages writes there but is the
 * Communications sweep by definition. Anything else is core company work, HQ's.
 */
export function roomIdForCommand(commandId: string, outputPath: string | null, departmentSlugs: ReadonlySet<string>): string {
  if (commandId === "check-messages" && departmentSlugs.has("comms")) return departmentRoomId("comms")
  const [, area, folder] = outputPath?.match(/^(records|notes)\/([^/]+)\//) ?? []
  const slug = folder?.toLowerCase()
  if (!slug || (area === "notes" && slug === "company")) return HQ_ROOM.id
  return departmentSlugs.has(slug) ? departmentRoomId(slug) : HQ_ROOM.id
}

/**
 * The room a terminal workspace's name points at: the room's name, its slug, or
 * for a team its pack label, ignoring case and punctuation. Null means the hot desks.
 */
export function roomIdForWorkspace(workspaceName: string | undefined, rooms: Room[], packs: InstalledPack[]): string | null {
  const key = workspaceName ? normalize(workspaceName) : ""
  if (!key) return null
  for (const room of rooms) {
    const names = [room.name, room.id.split(":").at(-1) ?? ""]
    if (room.kind === "team") {
      const pack = packs.find((p) => teamRoomId(p.id) === room.id)
      if (pack) names.push(pack.label)
    }
    if (names.some((name) => normalize(name) === key)) return room.id
  }
  return null
}

/** One resident per AI this company uses: its own AI first, then workspace AIs, then any AI seen working. */
export function residentsFor(
  companyExecutorId: string | null,
  workspaceExecutorIds: (string | undefined)[],
  workerExecutorIds: (string | null)[]
): Resident[] {
  const ids: string[] = []
  for (const id of [companyExecutorId, ...workspaceExecutorIds, ...workerExecutorIds]) {
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids.map((executorId) => ({ executorId, ...residentLook(executorId) }))
}
