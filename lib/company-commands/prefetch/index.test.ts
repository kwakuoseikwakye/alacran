import { describe, it, expect } from "vitest"
import { COMPANY_COMMANDS } from "../registry"
import { runPrefetch } from "./index"
import type { PrefetchContext, PrefetchExecFileFn } from "./types"

const execFn: PrefetchExecFileFn = async () => ({ stdout: "", stderr: "" })
const ctx = (): PrefetchContext => ({ agentRootPath: "/tmp/x", fieldValues: {}, execFn })

describe("prefetchKind migration", () => {
  it("leaves exactly one pre-existing command declaring a prefetch kind", () => {
    const withKind = COMPANY_COMMANDS.filter((c) => c.prefetchKind !== undefined).map((c) => c.id)
    expect(withKind).toEqual(["handoff"])
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

  it("refuses kinds with no handler yet, naming the kind in the message", async () => {
    for (const kind of ["triage-email", "triage-issue"] as const) {
      const result = await runPrefetch(kind, ctx())
      expect(result).toEqual({ ok: false, message: `No prefetch handler for kind: ${kind}` })
    }
  })
})
