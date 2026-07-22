import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "save-skill-test-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

async function mockAgents() {
  vi.doMock("./config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./config")>()
    return {
      ...actual,
      AGENTS: [{ id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }],
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
    expect(calls[0]).toEqual(["-C", root, "add", "--", path.join("skills", "plh-dev-team", "SKILL.md")])
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
})
