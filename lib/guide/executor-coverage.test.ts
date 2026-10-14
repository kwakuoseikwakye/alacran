import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { AI_EXECUTORS } from "@/lib/ai-executors"
import { EXECUTOR_COVERAGE } from "./executor-coverage"

const DATE = /^\d{4}-\d{2}-\d{2}$/
// The folders the app itself writes a company's skills into (shared, plus the Claude Code and Kiro mirrors).
const APP_WRITES = [".agents/skills", ".claude/skills", ".claude/commands", ".kiro/skills"]

describe("executor coverage table", () => {
  it("has exactly one entry per registered executor (a new AI fails here until answered)", () => {
    expect(Object.keys(EXECUTOR_COVERAGE).sort()).toEqual(Object.keys(AI_EXECUTORS).sort())
  })
  it.each(Object.entries(EXECUTOR_COVERAGE))("%s cites its sources", (_id, c) => {
    expect(c.sources.length).toBeGreaterThan(0)
    for (const s of c.sources) {
      expect(s.url.startsWith("https://")).toBe(true)
      expect(s.readOn).toMatch(DATE)
    }
  })
  it.each(Object.entries(EXECUTOR_COVERAGE))("%s can discover at least one folder the app writes skills into", (_id, c) => {
    expect(c.skillFolders.some((f) => APP_WRITES.includes(f))).toBe(true)
  })
  it.each(Object.entries(EXECUTOR_COVERAGE))("%s: a verdict needs real evidence, 'unverified' needs none", (_id, c) => {
    const b = c.behaviour
    if (b.verdict === "unverified") {
      expect(b.evidence).toBeNull()
      expect(b.measuredOn).toBeNull()
      return
    }
    expect(b.cliVersion).toBeTruthy()
    expect(b.measuredOn).toMatch(DATE)
    expect(b.evidence).toMatch(/^docs\/guide-coverage\/.+\.md$/)
    expect(fs.existsSync(path.join(process.cwd(), b.evidence!))).toBe(true)
  })
  it("a documented-only cell never says measured", () => {
    for (const c of Object.values(EXECUTOR_COVERAGE)) {
      if (c.printModeLoadsAgreement === "measured") expect(c.behaviour.verdict).not.toBe("unverified")
    }
  })
})
