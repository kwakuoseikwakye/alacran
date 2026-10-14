import { describe, it, expect } from "vitest"
import { buildOffice, nextSchedule, type OfficeInput } from "./build-office"
import { nextPollDelay, statusLine, wasDrag, type Desk, type Office } from "./types"
import type { RunSummary } from "@/lib/agent-runs/run-engine"
import type { RunStatus } from "@/lib/agent-runs/records"

// 2026-10-02 15:30 local time.
const NOW = new Date(2026, 9, 2, 15, 30)

function input(over: Partial<OfficeInput> = {}): OfficeInput {
  return {
    companyId: "acme",
    now: NOW,
    sessions: [],
    runs: [],
    commandRunning: false,
    runningCommand: null,
    pendingReviews: [],
    schedules: [],
    lastRuns: {},
    companyExecutorId: "claude-code",
    workspaces: [],
    packs: [],
    departments: [],
    ...over,
  }
}

function run(id: string, status: RunStatus, driving = false): RunSummary {
  return { id, title: `Run ${id}`, status, reason: null, changedFiles: 0, summary: null, startedAt: "2026-10-02T14:00:00.000Z", endedAt: null, driving, executorId: "claude-code" }
}

const desk = (office: ReturnType<typeof buildOffice>, id: Desk["id"]) => office.desks.find((d) => d.id === id)!

describe("buildOffice", () => {
  it("shows an empty office for a company that has never run anything", () => {
    const office = buildOffice(input())
    expect(office.desks.map((d) => d.id)).toEqual(["terminal", "runs", "schedule"])
    expect(office.desks.every((d) => d.workers.length === 0 && !d.unreadable)).toBe(true)
    expect(desk(office, "schedule").note).toBe("Nothing scheduled")
    expect(office.summary).toBe("Nothing running")
    expect(office.checkedAt).toBe(NOW.toISOString())
  })

  it("puts only AI terminal sessions at the Terminal desk", () => {
    const office = buildOffice(input({
      sessions: [
        { id: "s1", kind: "ai", label: "Claude Code", startedAt: Date.parse("2026-10-02T14:00:00.000Z") },
        { id: "s2", kind: "shell", label: "Command line", startedAt: 0 },
        { id: "s3", kind: "run", label: "Refresh", startedAt: 0 },
      ],
    }))
    expect(desk(office, "terminal").workers).toEqual([
      { id: "terminal:s1", label: "Claude Code", state: "working", startedAt: "2026-10-02T14:00:00.000Z", href: "/c/acme/terminal", executorId: null, roomId: "hot-desks" },
    ])
  })

  it.each([
    ["running", false, "working"],
    ["running", true, "working"],
    ["needs-review", false, "waiting"],
    ["interrupted", false, "waiting"],
    ["failed", false, "failed"],
  ] as const)("maps a %s run (driving %s) to %s, same as the run card", (status, driving, state) => {
    // The run's own terminal session is live, as it is while a run really works.
    const office = buildOffice(input({ runs: [run("r1", status, driving)], sessions: [{ id: "r1", kind: "run", label: "Run r1", startedAt: 0 }] }))
    expect(desk(office, "runs").workers).toEqual([
      { id: "run:r1", label: "Run r1", state, startedAt: "2026-10-02T14:00:00.000Z", href: "/c/acme/terminal", executorId: "claude-code", roomId: state === "waiting" ? "your-desk" : "hot-desks" },
    ])
  })

  it("does not show a run as working when its process is gone (the app closed mid-run)", () => {
    const office = buildOffice(input({ runs: [run("r1", "running")] }))
    expect(desk(office, "runs").workers.map((w) => [w.id, w.state])).toEqual([["run:r1", "waiting"]])
    expect(office.summary).toBe("1 waiting on you")
  })

  it("keeps trusting a running record when terminal sessions could not be read", () => {
    const office = buildOffice(input({ runs: [run("r1", "running")], sessions: new Error("x") }))
    expect(desk(office, "runs").workers.map((w) => w.state)).toEqual(["working"])
  })

  it("ignores schedule entries that are not shaped like a schedule", () => {
    const office = buildOffice(input({
      schedules: [null, { agentId: "acme" }, { agentId: "acme", commandId: "digest", time: 7 }, { agentId: "acme", commandId: "digest", time: "18:00" }] as never,
    }))
    expect(desk(office, "schedule").note).toBe("Next: digest at 18:00")
  })

  it("leaves a run with no changes out of the office", () => {
    expect(desk(buildOffice(input({ runs: [run("r1", "no-changes")] })), "runs").workers).toEqual([])
  })

  it("shows a running company command and this company's approvals, not another company's", () => {
    const office = buildOffice(input({
      commandRunning: true,
      pendingReviews: [
        { agentId: "acme", commandId: "digest" },
        { agentId: "other-co", commandId: "refresh" },
      ],
    }))
    expect(desk(office, "runs").workers).toEqual([
      { id: "command:running", label: "Company command", state: "working", startedAt: null, href: "/c/acme/tasks", executorId: "claude-code", roomId: "hq" },
      { id: "review:digest", label: "Save your weekly summary", state: "waiting", startedAt: null, href: "/c/acme/tasks", executorId: "claude-code", roomId: "your-desk" },
    ])
  })

  it("marks only the desk whose source failed, and keeps the rest", () => {
    const office = buildOffice(input({
      sessions: [{ id: "s1", kind: "ai", label: "Codex", startedAt: 0 }],
      runs: new Error("disk"),
      pendingReviews: [{ agentId: "acme", commandId: "digest" }],
    }))
    expect(desk(office, "terminal").unreadable).toBeUndefined()
    expect(desk(office, "terminal").workers).toHaveLength(1)
    expect(desk(office, "runs").unreadable).toBe("Can't read agent runs")
    expect(desk(office, "runs").workers.map((w) => w.id)).toEqual(["review:digest"])
    expect(office.summary).toBe("1 working · 1 waiting on you · Can't read agent runs")
  })

  it("never says Nothing running when a source could not be read", () => {
    const office = buildOffice(input({ sessions: new Error("x") }))
    expect(desk(office, "terminal").unreadable).toBe("Can't read terminals")
    expect(office.summary).toBe("Can't read terminals")
  })

  it("says it can't read schedules rather than Nothing scheduled", () => {
    const office = buildOffice(input({ schedules: new Error("bad json") }))
    expect(desk(office, "schedule").unreadable).toBe("Can't read schedules")
    expect(desk(office, "schedule").note).toBeUndefined()
  })

  it("names the next scheduled job and its last result", () => {
    const office = buildOffice(input({
      schedules: [
        { agentId: "acme", commandId: "check-messages", time: "07:00" },
        { agentId: "acme", commandId: "session-note", time: "18:00" },
        { agentId: "other-co", commandId: "digest", time: "16:00" },
      ],
      lastRuns: { "acme:session-note": { date: "2026-10-01", message: "Started" } },
    }))
    expect(desk(office, "schedule").note).toBe("Next: session note at 18:00. Last time: Started")
    expect(office.summary).toBe("Nothing running · next: session note at 18:00")
  })

  it("counts working, waiting and stopped in the summary", () => {
    const office = buildOffice(input({
      sessions: [
        { id: "a", kind: "ai", label: "Claude Code", startedAt: 0 },
        { id: "b", kind: "ai", label: "Codex", startedAt: 0 },
      ],
      runs: [run("r1", "needs-review"), run("r2", "failed")],
    }))
    expect(office.summary).toBe("2 working · 1 waiting on you · 1 stopped")
  })

  it("sends a terminal to the room its workspace is named after, others to the hot desks", () => {
    const office = buildOffice(input({
      packs: [{ id: "marketing", label: "Marketing", category: "Marketing" }],
      workspaces: [{ id: "main", name: "Main" }, { id: "w1", name: "Marketing", executorId: "codex" }],
      sessions: [
        { id: "s1", kind: "ai", label: "Codex CLI", startedAt: 0, workspaceId: "w1", executorId: "codex" },
        { id: "s2", kind: "ai", label: "Claude Code", startedAt: 0, executorId: "claude-code" },
      ],
    }))
    expect(desk(office, "terminal").workers.map((w) => [w.id, w.roomId, w.executorId])).toEqual([
      ["terminal:s1", "team:marketing", "codex"],
      ["terminal:s2", "hot-desks", "claude-code"],
    ])
  })

  it("names the running company command and puts it in its department, even one with no records yet", () => {
    const office = buildOffice(input({
      commandRunning: true,
      runningCommand: { commandId: "sync-finances", executorId: "codex", startedAt: "2026-10-03T09:00:00.000Z" },
      departments: [{ slug: "finances", name: "Finances", color: "#10b981", recordsCount: 0 }],
    }))
    expect(desk(office, "runs").workers[0]).toMatchObject({
      id: "command:running",
      label: "Reconcile Financial Records",
      roomId: "dept:finances",
      executorId: "codex",
      startedAt: "2026-10-03T09:00:00.000Z",
    })
    expect(office.rooms.map((r) => r.id)).toEqual(["hq", "dept:finances"])
  })

  it("keeps an unnamed running command in HQ, done by the company's AI", () => {
    const office = buildOffice(input({ commandRunning: true }))
    expect(desk(office, "runs").workers[0]).toMatchObject({ label: "Company command", roomId: "hq", executorId: "claude-code" })
  })

  it("lists each AI once as a resident, the company's own first", () => {
    const office = buildOffice(input({
      workspaces: [{ id: "w1", name: "Research", executorId: "kimi" }],
      runs: [{ ...run("r1", "running"), executorId: "codex" }],
      sessions: [{ id: "r1", kind: "run", label: "Run", startedAt: 0 }],
    }))
    expect(office.residents.map((r) => r.executorId)).toEqual(["claude-code", "kimi", "codex"])
  })

  it("says it can't read teams or departments without hiding anyone's work", () => {
    const office = buildOffice(input({
      packs: new Error("x"),
      departments: new Error("y"),
      sessions: [{ id: "s1", kind: "ai", label: "Claude Code", startedAt: 0 }],
    }))
    expect(office.rooms.map((r) => r.id)).toEqual(["hq"])
    expect(office.summary).toBe("1 working · Can't read teams · Can't read departments")
    expect(office.moreRooms).toBe(0)
  })
})

describe("nextSchedule", () => {
  const s = (time: string, agentId = "acme") => ({ agentId, commandId: `job-${time}`, time })

  it("picks the first job later today", () => {
    expect(nextSchedule([s("18:00"), s("16:00"), s("07:00")], "acme", "15:30")).toEqual({ schedule: s("16:00"), tomorrow: false })
  })

  it("rolls to tomorrow's first job when every time has passed, including this minute", () => {
    expect(nextSchedule([s("15:30"), s("07:00")], "acme", "15:30")).toEqual({ schedule: s("07:00"), tomorrow: true })
  })

  it("ignores other companies and returns null when there is nothing", () => {
    expect(nextSchedule([s("18:00", "other-co")], "acme", "15:30")).toBeNull()
  })
})

describe("office helpers", () => {
  it("polls every 4 s and backs off to a 30 s ceiling", () => {
    expect([0, 1, 2, 3, 4, 10].map(nextPollDelay)).toEqual([4000, 8000, 16000, 30000, 30000, 30000])
  })
})

describe("card text", () => {
  const office: Office = { desks: [], rooms: [], moreRooms: 0, residents: [], summary: "1 working", checkedAt: "2026-10-02T15:30:00.000Z" }
  const now = Date.parse("2026-10-02T15:30:12.000Z")

  it("says it is looking until the first answer", () => {
    expect(statusLine(null, false, now)).toBe("Looking…")
  })

  it("says so when the first answer never comes", () => {
    expect(statusLine(null, true, now)).toBe("Couldn't load who's working")
  })

  it("keeps the last summary and says how old it is when updates fail", () => {
    expect(statusLine(office, false, now)).toBe("1 working")
    expect(statusLine(office, true, now)).toBe("1 working · Couldn't update · last checked 12s ago")
  })

  it("treats a pointer that moved more than a few pixels as a drag, not a click", () => {
    expect(wasDrag({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(false)
    expect(wasDrag({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(true)
    expect(wasDrag(null, { x: 20, y: 10 })).toBe(false)
  })
})
