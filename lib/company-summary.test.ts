import { describe, it, expect } from "vitest"
import { latestWatchedCommit, buildGetStartedIntroPrompt, COMPANY_SUMMARY_PATH, WATCHED_PATHS } from "./company-summary"
import type { ExecFileFn } from "./terminal-launch-command"

describe("latestWatchedCommit", () => {
  it("asks git for the latest commit touching exactly the watched paths, scoped to the repo", async () => {
    const calls: { command: string; args: string[] }[] = []
    const execFn: ExecFileFn = async (command, args) => {
      calls.push({ command, args })
      return { stdout: "abc123\n", stderr: "" }
    }
    const sha = await latestWatchedCommit("/companies/acme", execFn)
    expect(sha).toBe("abc123")
    expect(calls).toEqual([
      { command: "git", args: ["-C", "/companies/acme", "log", "-1", "--format=%H", "--", ...WATCHED_PATHS] },
    ])
  })

  it("returns null when git has no commits touching those paths (empty stdout)", async () => {
    const execFn: ExecFileFn = async () => ({ stdout: "", stderr: "" })
    expect(await latestWatchedCommit("/companies/acme", execFn)).toBeNull()
  })

  it("returns null rather than throwing when git itself fails (no repo, no git installed)", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("not a git repository")
    }
    expect(await latestWatchedCommit("/companies/acme", execFn)).toBeNull()
  })
})

describe("buildGetStartedIntroPrompt", () => {
  const execFnReturning = (sha: string): ExecFileFn => async () => ({ stdout: `${sha}\n`, stderr: "" })

  it("fresh: current commit matches the summary's stored source_commit — tells the agent to just read the summary", async () => {
    const execFn = execFnReturning("abc123")
    const readFileFn = async (path: string) => {
      expect(path).toContain(COMPANY_SUMMARY_PATH)
      return "---\ntype: company-summary\nsource_commit: abc123\n---\n\nSummary here.\n"
    }
    const prompt = await buildGetStartedIntroPrompt("/companies/acme", execFn, readFileFn)
    expect(prompt).toContain(`Read ${COMPANY_SUMMARY_PATH}`)
    expect(prompt).toContain("up to date")
    expect(prompt).not.toContain(".claude/skills/")
  })

  it("stale: current commit differs from the stored source_commit — tells the agent to regenerate", async () => {
    const execFn = execFnReturning("newsha456")
    const readFileFn = async () => "---\nsource_commit: oldsha123\n---\n\nStale summary.\n"
    const prompt = await buildGetStartedIntroPrompt("/companies/acme", execFn, readFileFn)
    expect(prompt).toContain(".claude/skills/")
    expect(prompt).toContain(`write ${COMPANY_SUMMARY_PATH}`)
    expect(prompt).toContain("source_commit: newsha456")
  })

  it("missing summary file: treated as stale, embeds the real current commit for the agent to write", async () => {
    const execFn = execFnReturning("abc123")
    const readFileFn = async () => {
      throw new Error("ENOENT")
    }
    const prompt = await buildGetStartedIntroPrompt("/companies/acme", execFn, readFileFn)
    expect(prompt).toContain(".claude/skills/")
    expect(prompt).toContain("source_commit: abc123")
  })

  it("git can't determine a commit at all: still safely falls back to the stale/regenerate path", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("no git")
    }
    const readFileFn = async () => "---\nsource_commit: whatever\n---\n"
    const prompt = await buildGetStartedIntroPrompt("/companies/acme", execFn, readFileFn)
    expect(prompt).toContain(".claude/skills/")
    expect(prompt).toContain("source_commit: none")
  })
})
