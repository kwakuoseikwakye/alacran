import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm, readFile, realpath } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"
import { scanSkillsDir } from "./skills/scan-helpers"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "save-skill-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

// See resolve-known-skill.test.ts's mockAgents() comment: ./config's
// SKILL_ADAPTERS must be mocked explicitly (not inherited via `...actual`),
// since it's computed from real ~/AI-Native/* directories that only exist on
// this repo's own dev machine, not a clean checkout/CI runner.
async function mockAgents() {
  vi.doMock("./config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./config")>()
    return {
      ...actual,
      AGENTS: [{ id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: root, kind: "pipeline" }],
      SKILL_ADAPTERS: { "email-pipeline-agent": (agent: { id: string; rootPath: string }) => scanSkillsDir(agent.id, path.join(agent.rootPath, "skills")) },
    }
  })
}

describe("saveSkillContentImpl", () => {
  it("writes the file and commits it when the path is a known skill", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "---\nname: plh-dev-team\ndescription: old\n---\nold body\n")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")

    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }

    const result = await saveSkillContentImpl(
      skillFile,
      "---\nname: plh-dev-team\ndescription: new\n---\nnew body\n",
      fakeExec
    )

    expect(result).toEqual({ saved: true, message: "Saved and committed" })
    const written = await readFile(skillFile, "utf-8")
    expect(written).toContain("new body")
    expect(calls[0]).toEqual(["-C", await realpath(root), "add", "--", path.join("skills", "plh-dev-team", "SKILL.md")])
    expect(calls[1][0]).toBe("-C")
  })

  it("refuses to write a path outside any configured agent root", async () => {
    await mockAgents()
    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const outsidePath = path.join(tmpdir(), "outside.md")

    const result = await saveSkillContentImpl(outsidePath, "new content")

    expect(result).toEqual({
      saved: false,
      message: "Refusing to write a path outside configured agent directories",
    })
  })

  it("refuses to write a path inside an agent root that isn't a known skill/command file", async () => {
    await mockAgents()
    await mkdir(path.join(root, "bin"), { recursive: true })
    const notASkill = path.join(root, "bin", "poll.sh")
    await writeFile(notASkill, "#!/bin/bash\necho hi\n")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const result = await saveSkillContentImpl(notASkill, "malicious content")

    expect(result).toEqual({
      saved: false,
      message: "Refusing to write a path that is not a known skill/command file",
    })
  })

  it("returns a no-op message when content is unchanged", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    const content = "---\nname: plh-dev-team\ndescription: same\n---\nsame body\n"
    await writeFile(skillFile, content)

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const result = await saveSkillContentImpl(skillFile, content)

    expect(result).toEqual({ saved: false, message: "No changes to save" })
  })

  it("returns a failure message when the commit fails, without throwing", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const fakeExec: ExecFileFn = async () => {
      throw new Error("not a git repository")
    }

    const result = await saveSkillContentImpl(skillFile, "new", fakeExec)

    expect(result).toEqual({ saved: false, message: "not a git repository" })
  })

  it("uses a custom commit message verbatim when provided", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }

    const result = await saveSkillContentImpl(skillFile, "new", fakeExec, "Fix the onboarding step")

    expect(result).toEqual({ saved: true, message: "Saved and committed" })
    expect(calls[1]).toContain("Fix the onboarding step")
  })

  it("trims whitespace from a custom commit message", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }

    await saveSkillContentImpl(skillFile, "new", fakeExec, "  spaced out  ")

    expect(calls[1]).toContain("spaced out")
  })

  it("falls back to the default message when customMessage is blank/whitespace-only", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }

    await saveSkillContentImpl(skillFile, "new", fakeExec, "   ")

    expect(calls[1]).toContain("Edit SKILL.md via AI-Native control panel")
  })

  it("rejects an overly long custom commit message before writing anything", async () => {
    await mockAgents()
    await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
    const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
    await writeFile(skillFile, "old")

    const { saveSkillContentImpl } = await import("./save-skill-content-impl")
    let execCalled = false
    const fakeExec: ExecFileFn = async () => {
      execCalled = true
      return { stdout: "", stderr: "" }
    }

    const tooLong = "a".repeat(501)
    const result = await saveSkillContentImpl(skillFile, "new", fakeExec, tooLong)

    expect(result).toEqual({ saved: false, message: "Commit message is too long (max 500 characters)" })
    expect(execCalled).toBe(false)
    const written = await readFile(skillFile, "utf-8")
    expect(written).toBe("old")
  })
})
