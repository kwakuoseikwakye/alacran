import { describe, it, expect } from "vitest"
import { COMPANY_COMMANDS } from "../registry"
import { runPrefetch } from "./index"
import type { PrefetchContext, PrefetchExecFileFn } from "./types"

const execFn: PrefetchExecFileFn = async () => ({ stdout: "", stderr: "" })
const ctx = (): PrefetchContext => ({ agentRootPath: "/tmp/x", fieldValues: {}, execFn })

describe("prefetchKind migration", () => {
  it("leaves exactly handoff and triage-email declaring a prefetch kind", () => {
    const withKind = COMPANY_COMMANDS.filter((c) => c.prefetchKind !== undefined).map((c) => c.id)
    expect(withKind).toEqual(["handoff", "triage-email"])
  })

  it("gives handoff the repo-status kind", () => {
    expect(COMPANY_COMMANDS.find((c) => c.id === "handoff")?.prefetchKind).toBe("repo-status")
  })

  it("has removed needsPrefetch from every command", () => {
    for (const command of COMPANY_COMMANDS) {
      expect(command).not.toHaveProperty("needsPrefetch")
    }
  })
})

describe("runPrefetch", () => {
  it("returns empty text for a command with no prefetch kind", async () => {
    expect(await runPrefetch(undefined, ctx())).toEqual({ ok: true, text: "" })
  })

  it("dispatches repo-status", async () => {
    const result = await runPrefetch("repo-status", ctx())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.text).toContain("git log")
  })

  it("refuses triage-issue with no handler yet, naming the kind in the message", async () => {
    const result = await runPrefetch("triage-issue", ctx())
    expect(result).toEqual({ ok: false, message: "No prefetch handler for kind: triage-issue" })
  })

  it("dispatches triage-email to its real handler (which refuses without allowlist config, since ctx() has no readFileFn)", async () => {
    const result = await runPrefetch("triage-email", ctx())
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).not.toBe("No prefetch handler for kind: triage-email")
  })
})
