// lib/os/palette-sources.test.ts
import { describe, it, expect } from "vitest"
import { buildCommands, forMode, rankCommands } from "./palette-sources"

const input = {
  companyId: "acme",
  companies: [{ id: "acme", name: "Acme" }, { id: "northwind", name: "Northwind" }],
  agents: [{ id: "ledger", name: "Ledger" }],
}

describe("buildCommands", () => {
  it("includes every nav destination", () => {
    const ids = buildCommands(input).map((c) => c.id)
    expect(ids).toContain("nav-dashboard")
    expect(ids).toContain("nav-tasks")
    expect(ids).toContain("nav-terminal")
    expect(ids).toContain("nav-settings")
  })

  it("includes one switch command per company", () => {
    const cmds = buildCommands(input).filter((c) => c.hint === "company")
    expect(cmds.map((c) => c.id)).toEqual(["company-acme", "company-northwind"])
  })

  it("includes agents", () => {
    const cmds = buildCommands(input).filter((c) => c.hint === "agent")
    expect(cmds).toHaveLength(1)
    expect(cmds[0].href).toBe("/c/acme/agents")
  })

  it("points company-scoped nav at the picker when nothing is active", () => {
    const cmds = buildCommands({ ...input, companyId: null })
    expect(cmds.find((c) => c.id === "nav-dashboard")?.href).toBe("/")
  })
})

describe("rankCommands", () => {
  const cmds = buildCommands(input)

  it("returns everything for an empty query", () => {
    expect(rankCommands(cmds, "")).toHaveLength(cmds.length)
  })

  it("ranks a label prefix above a keyword match", () => {
    const results = rankCommands(cmds, "app")
    expect(results[0].id).toBe("nav-tasks")
  })

  it("is case-insensitive", () => {
    expect(rankCommands(cmds, "APPROVALS")[0].id).toBe("nav-tasks")
  })

  it("returns nothing when no command matches", () => {
    expect(rankCommands(cmds, "zzzzz")).toEqual([])
  })
})

describe("forMode", () => {
  const all = buildCommands({ companyId: "acme", companies: [], agents: [] })

  it("hides the pages simple mode hides from the sidebar", () => {
    const ids = forMode(all, false).map((c) => c.id)
    expect(ids).not.toContain("nav-doctor")
    expect(ids).not.toContain("nav-files")
    expect(ids).toContain("nav-tasks")
  })

  it("keeps everything in advanced mode", () => {
    expect(forMode(all, true)).toEqual(all)
  })
})
