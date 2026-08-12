import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"

let plhOpsRoot: string
let targetRoot: string
let execCalls: { command: string; args: string[] }[]

const fakeExecFn: ExecFileFn = async (command, args) => {
  execCalls.push({ command, args })
  return { stdout: "", stderr: "" }
}

beforeEach(async () => {
  plhOpsRoot = await mkdtemp(path.join(tmpdir(), "plh-ops-fixture-"))
  targetRoot = await mkdtemp(path.join(tmpdir(), "target-co-"))
  execCalls = []

  await mkdir(path.join(plhOpsRoot, "workflow", "daily-team-log"), { recursive: true })
  await writeFile(path.join(plhOpsRoot, "workflow", "daily-team-log", "gather.py"), "# gather.py contents\n")
  await writeFile(
    path.join(plhOpsRoot, "workflow", "daily-team-log", "config.example.json"),
    JSON.stringify({ person: null, projects: [], output_repo: null })
  )
})

afterEach(async () => {
  await rm(plhOpsRoot, { recursive: true, force: true })
  await rm(targetRoot, { recursive: true, force: true })
  vi.resetModules()
})

async function mockAgents() {
  vi.doMock("./config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./config")>()
    return {
      ...actual,
      AGENTS: [
        { id: "plh-ops", name: "PLH Ops", rootPath: plhOpsRoot, kind: "report-log" },
        { id: "second-co", name: "Second Co", rootPath: targetRoot, kind: "command-set" },
      ],
    }
  })
}

describe("installDailyTeamLogImpl", () => {
  it("copies gather.py and config.example.json verbatim into .claude/skills/daily-team-log", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    const result = await installDailyTeamLogImpl("second-co", fakeExecFn)

    expect(result).toEqual({ ok: true })
    const skillDir = path.join(targetRoot, ".claude", "skills", "daily-team-log")
    expect(await readFile(path.join(skillDir, "gather.py"), "utf-8")).toBe("# gather.py contents\n")
    const config = JSON.parse(await readFile(path.join(skillDir, "config.example.json"), "utf-8"))
    expect(config).toEqual({ person: null, projects: [], output_repo: null })
  })

  it("writes a SKILL.md with the target company's name and no PLH/Owner references", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    await installDailyTeamLogImpl("second-co", fakeExecFn)

    const skillMd = await readFile(
      path.join(targetRoot, ".claude", "skills", "daily-team-log", "SKILL.md"),
      "utf-8"
    )
    expect(skillMd).toContain("business: Second Co")
    expect(skillMd).not.toMatch(/PLH/i)
    expect(skillMd).not.toMatch(/Owner/i)
  })

  it("writes a Setup.md with no plh-ops-specific references", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    await installDailyTeamLogImpl("second-co", fakeExecFn)

    const setupMd = await readFile(
      path.join(targetRoot, ".claude", "skills", "daily-team-log", "Setup.md"),
      "utf-8"
    )
    // By shape, not by name — see the matching guard in
    // daily-team-log-files.test.ts for why the upstream owner and teammates
    // are not spelled out here.
    expect(setupMd).not.toMatch(/github\.com\/[\w.-]+\/[\w.-]+/)
    expect(setupMd).not.toMatch(/reports\/[A-Z][a-z]+/)
    expect(setupMd).not.toMatch(/plh-ops/i)
  })

  it("commits the installed skill directory via the injected exec function", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    await installDailyTeamLogImpl("second-co", fakeExecFn)

    const relativeSkillDir = path.join(".claude", "skills", "daily-team-log")
    expect(execCalls).toEqual([
      { command: "git", args: ["-C", targetRoot, "add", "--", relativeSkillDir] },
      {
        command: "git",
        args: [
          "-C",
          targetRoot,
          "commit",
          "-m",
          "Install daily-team-log via AI-Native control panel",
          "--",
          relativeSkillDir,
        ],
      },
    ])
  })

  it("fails cleanly for an unknown agent id", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    const result = await installDailyTeamLogImpl("no-such-agent", fakeExecFn)

    expect(result).toEqual({ ok: false, message: "Unknown company" })
    expect(execCalls).toEqual([])
  })

  it("is idempotent - installing twice overwrites cleanly without erroring", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    const first = await installDailyTeamLogImpl("second-co", fakeExecFn)
    const second = await installDailyTeamLogImpl("second-co", fakeExecFn)

    expect(first).toEqual({ ok: true })
    expect(second).toEqual({ ok: true })
    const skillDir = path.join(targetRoot, ".claude", "skills", "daily-team-log")
    expect(await readFile(path.join(skillDir, "gather.py"), "utf-8")).toBe("# gather.py contents\n")
  })
})
