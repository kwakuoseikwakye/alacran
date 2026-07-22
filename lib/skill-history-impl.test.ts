import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "skill-history-test-"))
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
      AGENTS: [{ id: "email-pipeline-agent", name: "Email Pipeline Agent", rootPath: root, kind: "pipeline" }],
    }
  })
}

async function makeSkillFile(): Promise<string> {
  await mkdir(path.join(root, "skills", "plh-dev-team"), { recursive: true })
  const skillFile = path.join(root, "skills", "plh-dev-team", "SKILL.md")
  await writeFile(skillFile, "---\nname: plh-dev-team\ndescription: x\n---\n")
  return skillFile
}

describe("getSkillHistoryImpl", () => {
  it("parses commit history for a known skill file", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillHistoryImpl } = await import("./skill-history-impl")

    const fakeExec: ExecFileFn = async () => ({
      stdout:
        "abc123\x1f2026-07-22T10:00:00+09:00\x1fEdit SKILL.md via AI-Native control panel\x1e" +
        "def456\x1f2026-07-20T10:00:00+09:00\x1fInitial commit\x1e",
      stderr: "",
    })

    const result = await getSkillHistoryImpl(skillFile, fakeExec)

    expect(result).toEqual({
      ok: true,
      message: "",
      commits: [
        { sha: "abc123", date: "2026-07-22T10:00:00+09:00", message: "Edit SKILL.md via AI-Native control panel" },
        { sha: "def456", date: "2026-07-20T10:00:00+09:00", message: "Initial commit" },
      ],
    })
  })

  it("returns an empty commit list gracefully when there is no history yet", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillHistoryImpl } = await import("./skill-history-impl")
    const fakeExec: ExecFileFn = async () => ({ stdout: "", stderr: "" })

    const result = await getSkillHistoryImpl(skillFile, fakeExec)

    expect(result).toEqual({ ok: true, commits: [], message: "" })
  })

  it("refuses a path outside any configured agent root", async () => {
    await mockAgents()
    const { getSkillHistoryImpl } = await import("./skill-history-impl")
    const outsidePath = path.join(tmpdir(), "outside.md")

    const result = await getSkillHistoryImpl(outsidePath)

    expect(result).toEqual({
      ok: false,
      commits: [],
      message: "Refusing to read history for a path outside configured agent directories",
    })
  })

  it("refuses a path inside an agent root that isn't a known skill/command file", async () => {
    await mockAgents()
    await mkdir(path.join(root, "bin"), { recursive: true })
    const notASkill = path.join(root, "bin", "poll.sh")
    await writeFile(notASkill, "#!/bin/bash\n")

    const { getSkillHistoryImpl } = await import("./skill-history-impl")
    const result = await getSkillHistoryImpl(notASkill)

    expect(result).toEqual({
      ok: false,
      commits: [],
      message: "Refusing to read history for a path that is not a known skill/command file",
    })
  })

  it("returns ok:false when the git log command fails", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillHistoryImpl } = await import("./skill-history-impl")
    const fakeExec: ExecFileFn = async () => {
      throw new Error("not a git repository")
    }

    const result = await getSkillHistoryImpl(skillFile, fakeExec)

    expect(result).toEqual({ ok: false, commits: [], message: "not a git repository" })
  })
})

describe("getSkillRevisionImpl", () => {
  it("returns the file content at a given revision", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillRevisionImpl } = await import("./skill-history-impl")

    const fakeExec: ExecFileFn = async () => ({ stdout: "old content at that revision", stderr: "" })

    const result = await getSkillRevisionImpl(skillFile, "abc123", fakeExec)

    expect(result).toEqual({ ok: true, content: "old content at that revision", message: "" })
  })

  it("refuses a path outside any configured agent root", async () => {
    await mockAgents()
    const { getSkillRevisionImpl } = await import("./skill-history-impl")
    const result = await getSkillRevisionImpl(path.join(tmpdir(), "outside.md"), "abc123")

    expect(result).toEqual({
      ok: false,
      content: "",
      message: "Refusing to view history for a path outside configured agent directories",
    })
  })

  it("refuses a path that isn't a known skill/command file", async () => {
    await mockAgents()
    await mkdir(path.join(root, "bin"), { recursive: true })
    const notASkill = path.join(root, "bin", "poll.sh")
    await writeFile(notASkill, "#!/bin/bash\n")

    const { getSkillRevisionImpl } = await import("./skill-history-impl")
    const result = await getSkillRevisionImpl(notASkill, "abc123")

    expect(result).toEqual({
      ok: false,
      content: "",
      message: "Refusing to view history for a path that is not a known skill/command file",
    })
  })

  it("returns ok:false when git show fails (e.g. an invalid SHA)", async () => {
    await mockAgents()
    const skillFile = await makeSkillFile()
    const { getSkillRevisionImpl } = await import("./skill-history-impl")
    const fakeExec: ExecFileFn = async () => {
      throw new Error("fatal: invalid object name")
    }

    const result = await getSkillRevisionImpl(skillFile, "nonexistent", fakeExec)

    expect(result).toEqual({ ok: false, content: "", message: "fatal: invalid object name" })
  })
})
