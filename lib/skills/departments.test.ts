import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { departmentsByPath, skillBasename, GENERAL_DEPARTMENT, DEPARTMENT_ORDER } from "./departments"

describe("skillBasename", () => {
  it("reads a skill's own directory, not the SKILL.md filename", () => {
    expect(skillBasename("/c/.claude/skills/api-designer/SKILL.md")).toBe("api-designer")
  })

  it("reads a command's filename without .md", () => {
    expect(skillBasename("/c/.claude/commands/plan-feature.md")).toBe("plan-feature")
  })
})

describe("departmentsByPath", () => {
  let packsRoot: string

  beforeEach(async () => {
    packsRoot = await mkdtemp(path.join(tmpdir(), "departments-"))
    // Real pack dirNames, because the lookup walks COMPANY_STARTER_PACKS.
    await mkdir(path.join(packsRoot, "software-engineering", ".claude", "skills", "api-designer"), { recursive: true })
    await mkdir(path.join(packsRoot, "software-engineering", ".claude", "commands"), { recursive: true })
    await writeFile(path.join(packsRoot, "software-engineering", ".claude", "commands", "plan-feature.md"), "x")
    await writeFile(path.join(packsRoot, "software-engineering", ".claude", "skills", "UPSTREAM.md"), "x")
    await mkdir(path.join(packsRoot, "marketing", ".claude", "skills", "seo-audit"), { recursive: true })
  })

  afterEach(async () => {
    await rm(packsRoot, { recursive: true, force: true })
  })

  it("puts each pack's skills and commands in that pack's department", async () => {
    const got = await departmentsByPath(
      [
        "/co/.claude/skills/api-designer/SKILL.md",
        "/co/.claude/commands/plan-feature.md",
        "/co/.claude/skills/seo-audit/SKILL.md",
      ],
      packsRoot
    )
    expect(got["/co/.claude/skills/api-designer/SKILL.md"]).toBe("Engineering")
    expect(got["/co/.claude/commands/plan-feature.md"]).toBe("Engineering")
    expect(got["/co/.claude/skills/seo-audit/SKILL.md"]).toBe("Marketing")
  })

  it("leaves the base template's commands and the user's own skills in General", async () => {
    const got = await departmentsByPath(
      ["/co/.claude/commands/digest.md", "/co/.claude/skills/my-own-thing/SKILL.md"],
      packsRoot
    )
    expect(got["/co/.claude/commands/digest.md"]).toBe(GENERAL_DEPARTMENT)
    expect(got["/co/.claude/skills/my-own-thing/SKILL.md"]).toBe(GENERAL_DEPARTMENT)
  })

  it("does not treat the UPSTREAM.md provenance file as a skill", async () => {
    const got = await departmentsByPath(["/co/.claude/skills/UPSTREAM.md"], packsRoot)
    expect(got["/co/.claude/skills/UPSTREAM.md"]).toBe(GENERAL_DEPARTMENT)
  })

  it("orders General first, so the core commands are at the top of the tree", () => {
    expect(DEPARTMENT_ORDER[0]).toBe(GENERAL_DEPARTMENT)
    expect(new Set(DEPARTMENT_ORDER).size).toBe(DEPARTMENT_ORDER.length)
  })
})
