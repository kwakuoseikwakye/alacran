import { describe, it, expect } from "vitest"
import {
  buildRoomList,
  departmentRoom,
  HQ_ROOM,
  MAX_ROOMS,
  residentsFor,
  roomIdForCommand,
  roomIdForWorkspace,
  teamRoom,
  type DepartmentInfo,
  type InstalledPack,
} from "./rooms"

const marketing: InstalledPack = { id: "marketing", label: "Marketing", category: "Marketing" }
const engineering: InstalledPack = { id: "software-engineering", label: "Software engineering", category: "Engineering" }
const dept = (slug: string, recordsCount = 0, name = slug): DepartmentInfo => ({ slug, name, color: "#123456", recordsCount })
const BASE = [
  dept("funnel", 0, "Value Pipeline"),
  dept("comms", 0, "Communications"),
  dept("content", 0, "Content"),
  dept("social", 0, "Distribution"),
  dept("finances", 3, "Finances"),
]
const SLUGS = new Set(BASE.map((d) => d.slug))

describe("buildRoomList", () => {
  it("always has HQ, then installed teams, then departments that hold records", () => {
    const { rooms, moreRooms } = buildRoomList([engineering, marketing], BASE, new Set())
    expect(rooms.map((r) => r.id)).toEqual(["hq", "team:software-engineering", "team:marketing", "dept:finances"])
    expect(moreRooms).toBe(0)
  })

  it("adds a department with no records while someone works in it", () => {
    const { rooms } = buildRoomList([], BASE, new Set(["dept:comms"]))
    expect(rooms.map((r) => r.id)).toEqual(["hq", "dept:comms", "dept:finances"])
  })

  it("caps at twelve rooms, never dropping HQ or a busy room, and keeps the order", () => {
    const many = Array.from({ length: 14 }, (_, i) => dept(`d${String(i).padStart(2, "0")}`, 1))
    const { rooms, moreRooms } = buildRoomList([marketing], many, new Set(["dept:d13"]))
    expect(rooms).toHaveLength(MAX_ROOMS)
    expect(rooms[0].id).toBe("hq")
    expect(rooms.at(-1)?.id).toBe("dept:d13")
    expect(moreRooms).toBe(16 - MAX_ROOMS)
  })
})

describe("room looks", () => {
  it("gives teams their own colour and glyph, and departments their registry colour", () => {
    expect(teamRoom(engineering)).toEqual({ id: "team:software-engineering", kind: "team", name: "Engineering", color: "#4338ca", glyph: "</>" })
    // Money green, kept clear of Finances (#10b981) and the "working" status green (#22c55e).
    expect(teamRoom({ id: "sales", label: "Sales", category: "Sales" }).color).toBe("#166534")
    expect(departmentRoom(dept("finances", 1, "Finances"))).toEqual({ id: "dept:finances", kind: "department", name: "Finances", color: "#123456", glyph: "#" })
  })

  it("uses the first letter for a department known only as a records folder", () => {
    expect(departmentRoom(dept("workflows", 2, "Workflows")).glyph).toBe("W")
  })
})

describe("roomIdForCommand", () => {
  it.each([
    ["sync-funnel", "records/funnel/leads.yaml", "dept:funnel"],
    ["sync-finances", "records/finances/transactions.yaml", "dept:finances"],
    ["make-posts", "notes/content/posts", "dept:content"],
    ["research-prospects", "notes/funnel/prospects", "dept:funnel"],
    ["audit-finances", "notes/finances/recommendations", "dept:finances"],
    ["find-replies", "notes/comms/inquiries", "dept:comms"],
    ["check-messages", "notes/company/messages", "dept:comms"],
    ["digest", "notes/company/digests", "hq"],
    ["refresh", "definitions/ontology/company.yaml", "hq"],
    ["decision", "docs/decisions", "hq"],
    ["mystery", "notes/nowhere/x", "hq"],
    ["unknown", null, "hq"],
  ] as const)("%s writing %s works in %s", (commandId, outputPath, room) => {
    expect(roomIdForCommand(commandId, outputPath, SLUGS)).toBe(room)
  })
})

describe("roomIdForWorkspace", () => {
  const rooms = [HQ_ROOM, teamRoom(marketing), teamRoom(engineering), ...BASE.map(departmentRoom)]
  const packs = [marketing, engineering]

  it.each([
    ["Marketing", "team:marketing"],
    ["  marketing!! ", "team:marketing"],
    ["Software engineering", "team:software-engineering"],
    ["Engineering", "team:software-engineering"],
    ["Finances", "dept:finances"],
    ["comms", "dept:comms"],
    ["Value Pipeline", "dept:funnel"],
    ["HQ", "hq"],
    ["Main", null],
    ["Research", null],
  ] as const)("a workspace named %j works in %s", (name, room) => {
    expect(roomIdForWorkspace(name, rooms, packs)).toBe(room)
  })

  it("sends a session with no workspace name to the hot desks", () => {
    expect(roomIdForWorkspace(undefined, rooms, packs)).toBeNull()
  })
})

describe("residentsFor", () => {
  it("lists each AI once: the company's first, then workspace AIs, then any seen working", () => {
    expect(residentsFor("claude-code", ["codex", undefined, "claude-code"], [null, "kimi", "codex"])).toEqual([
      { executorId: "claude-code", name: "Claude", color: "#d9774f" },
      { executorId: "codex", name: "Codex", color: "#f1f1ee" },
      { executorId: "kimi", name: "Kimi", color: "#6d5ef5" },
    ])
  })

  it("gives an AI it does not know a neutral look under its own id", () => {
    expect(residentsFor("future-ai", [], [])).toEqual([{ executorId: "future-ai", name: "future-ai", color: "#94a3b8" }])
  })

  it("has no residents when it cannot tell which AI the company uses", () => {
    expect(residentsFor(null, [], [])).toEqual([])
  })

  it("pins the Object.hasOwn guard against prototype pollution", () => {
    expect(residentsFor("constructor", [], [])).toEqual([{ executorId: "constructor", name: "constructor", color: "#94a3b8" }])
  })
})

describe("odd names", () => {
  it("gives a sign a real initial, never a space or half a character", () => {
    expect(teamRoom({ id: "x", label: "X", category: " zeta" }).glyph).toBe("Z")
    expect(departmentRoom(dept("fun", 1, "😀 Fun")).glyph).toBe("F")
    expect(departmentRoom(dept("q", 1, "!!!")).glyph).toBe("•")
  })

  it("ignores names that happen to be built-in object keys", () => {
    expect(teamRoom({ id: "c", label: "C", category: "constructor" })).toMatchObject({ color: HQ_ROOM.color, glyph: "C" })
    expect(departmentRoom(dept("constructor", 1, "Constructor")).glyph).toBe("C")
  })

  it("matches workspace names and department folders in any script", () => {
    const rooms = [HQ_ROOM, departmentRoom(dept("финансы", 1, "Финансы"))]
    expect(roomIdForWorkspace("финансы", rooms, [])).toBe("dept:финансы")
    expect(roomIdForCommand("ledger", "records/финансы/ledger.md", new Set(["финансы"]))).toBe("dept:финансы")
  })

  it("keeps company-wide notes in HQ even when a records/company folder exists", () => {
    const slugs = new Set(["company"])
    expect(roomIdForCommand("session-note", "notes/company/sessions/today.md", slugs)).toBe("hq")
    expect(roomIdForCommand("ledger", "records/company/ledger.md", slugs)).toBe("dept:company")
  })

  it("keeps HQ when more rooms are busy than fit", () => {
    const many = Array.from({ length: 14 }, (_, i) => dept(`d${i}`, 1))
    const { rooms, moreRooms } = buildRoomList([], many, new Set(many.map((d) => `dept:${d.slug}`)))
    expect(rooms[0].id).toBe("hq")
    expect(rooms).toHaveLength(MAX_ROOMS)
    expect(moreRooms).toBe(3)
  })

  it("finds a team room by its pack's label alone", () => {
    const support: InstalledPack = { id: "customer-support", label: "Help Desk", category: "Support" }
    expect(roomIdForWorkspace("help desk", [HQ_ROOM, teamRoom(support)], [support])).toBe("team:customer-support")
  })

  it("names a records folder that shares a team's name apart from the team", () => {
    const sales: InstalledPack = { id: "sales", label: "Sales", category: "Sales" }
    const { rooms } = buildRoomList([sales], [dept("sales", 2, "Sales")], new Set())
    expect(rooms.map((r) => r.name)).toEqual(["HQ", "Sales", "Sales records"])
  })
})

describe("custom departments in the office", () => {
  const legal = { slug: "legal", name: "Legal Affairs", color: "#0369a1", recordsCount: 2 }
  it("a custom department with records gets a room signed with its name, colour and initial", () => {
    const { rooms } = buildRoomList([], [legal], new Set())
    expect(rooms.find((r) => r.id === "dept:legal")).toMatchObject({ kind: "department", name: "Legal Affairs", color: "#0369a1", glyph: "L" })
  })
  it("an empty custom department gets no room until it holds records or someone works there", () => {
    expect(buildRoomList([], [{ ...legal, recordsCount: 0 }], new Set()).rooms.map((r) => r.id)).not.toContain("dept:legal")
    expect(buildRoomList([], [{ ...legal, recordsCount: 0 }], new Set(["dept:legal"])).rooms.map((r) => r.id)).toContain("dept:legal")
  })
  it("a non-Latin name signs with its own first character", () => {
    expect(departmentRoom({ slug: "department", name: "法務", color: "#0369a1", recordsCount: 1 }).glyph).toBe("法")
  })
  it("many departments never exceed MAX_ROOMS, keep HQ and say how many are left out", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ slug: `d${i}`, name: `Dept ${i}`, color: "#0369a1", recordsCount: 1 }))
    const { rooms, moreRooms } = buildRoomList([], many, new Set())
    expect(rooms).toHaveLength(MAX_ROOMS)
    expect(rooms[0].id).toBe("hq")
    expect(moreRooms).toBe(21 - MAX_ROOMS)
  })
})
