import { describe, it, expect } from "vitest"
import { buildRepoStatusPrefetch } from "./repo-status"
import type { PrefetchContext, PrefetchExecFileFn } from "./types"

const ctxWith = (execFn: PrefetchExecFileFn): PrefetchContext => ({
  agentRootPath: "/tmp/company",
  fieldValues: {},
  execFn,
})

describe("buildRepoStatusPrefetch", () => {
  it("includes both git log and issue output", async () => {
    const execFn: PrefetchExecFileFn = async (file) => ({
      stdout: file === "git" ? "abc1234 a real commit" : "#7 a real issue",
      stderr: "",
    })
    const result = await buildRepoStatusPrefetch(ctxWith(execFn))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("abc1234 a real commit")
    expect(result.text).toContain("#7 a real issue")
  })

  it("degrades rather than refusing when gh is unavailable", async () => {
    const execFn: PrefetchExecFileFn = async (file) => {
      if (file === "gh") throw new Error("command not found: gh")
      return { stdout: "abc1234 commit", stderr: "" }
    }
    const result = await buildRepoStatusPrefetch(ctxWith(execFn))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("gh unavailable or not authenticated")
  })

  it("degrades rather than refusing when git fails", async () => {
    const execFn: PrefetchExecFileFn = async (file) => {
      if (file === "git") throw new Error("not a git repository")
      return { stdout: "", stderr: "" }
    }
    const result = await buildRepoStatusPrefetch(ctxWith(execFn))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("unable to read git log")
  })

  it("reports the empty cases without erroring", async () => {
    const execFn: PrefetchExecFileFn = async () => ({ stdout: "   ", stderr: "" })
    const result = await buildRepoStatusPrefetch(ctxWith(execFn))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("(no commits in the last 24 hours)")
    expect(result.text).toContain("(no open issues)")
  })
})
