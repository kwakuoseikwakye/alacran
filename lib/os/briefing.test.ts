import { describe, it, expect } from "vitest"
import { composeBriefing } from "./briefing"

const base = { companyId: "acme", runsToday: [], pendingReviews: 0, recentComms: [] }

describe("composeBriefing", () => {
  it("says so plainly when there is nothing to report", () => {
    const lines = composeBriefing(base)
    expect(lines).toHaveLength(1)
    expect(lines[0].kind).toBe("quiet")
  })

  it("leads with approvals when any are pending", () => {
    const lines = composeBriefing({ ...base, pendingReviews: 2, runsToday: [{ commandId: "refresh", ok: true }] })
    expect(lines[0].kind).toBe("approval")
    expect(lines[0].text).toContain("2")
    expect(lines[0].href).toBe("/c/acme/tasks")
  })

  it("reports a failed run separately from successful ones", () => {
    const lines = composeBriefing({
      ...base,
      runsToday: [{ commandId: "digest", ok: true }, { commandId: "refresh", ok: false }],
    })
    const runLines = lines.filter((l) => l.kind === "run")
    expect(runLines.some((l) => l.text.includes("refresh"))).toBe(true)
    expect(runLines.some((l) => l.text.includes("failed"))).toBe(true)
  })

  it("mentions comms only when there are recent entries", () => {
    expect(composeBriefing(base).some((l) => l.kind === "comms")).toBe(false)
    const withComms = composeBriefing({
      ...base,
      recentComms: [{ id: "m:1", source: "messages" as const, date: "2026-09-09", title: "2026-09-09", path: "p" }],
    })
    expect(withComms.some((l) => l.kind === "comms")).toBe(true)
  })

  it("never emits the quiet line alongside real content", () => {
    const lines = composeBriefing({ ...base, pendingReviews: 1 })
    expect(lines.some((l) => l.kind === "quiet")).toBe(false)
  })

  it("emits unique ids", () => {
    const lines = composeBriefing({
      ...base,
      pendingReviews: 1,
      runsToday: [{ commandId: "digest", ok: true }],
      recentComms: [{ id: "m:1", source: "messages" as const, date: "2026-09-09", title: "t", path: "p" }],
    })
    const ids = lines.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
