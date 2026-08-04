import { describe, it, expect } from "vitest"
import { buildTriageEmailPrefetch } from "./triage-email"
import type { PrefetchContext, PrefetchExecFileFn } from "./types"

const SENDERS = "senders:\n  - takeshi@plh.life\n"
const REPOS = "repos:\n  - name: plh-mobile\n    path: /r/plh-mobile\n    description: Mobile app\n"

const configReader = async (p: string) => {
  if (p.endsWith("senders.yaml")) return SENDERS
  if (p.endsWith("repos.yaml")) return REPOS
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
}

const SEARCH_ROW = "ID\tDATE\tFROM\tSUBJECT\n19f0\t2026-08-04\ttakeshi@plh.life\tplh-mobile login broken"

function ctx(
  execFn: PrefetchExecFileFn,
  fieldValues: Record<string, string> = {},
  readFileFn: (p: string) => Promise<string> = configReader
): PrefetchContext {
  return { agentRootPath: "/c", fieldValues, execFn, readFileFn }
}

// gog get calls come in two shapes here: the metadata-only sender-verification
// call (--format metadata --headers From) and the full untrusted-wrapped body
// call (--format full --wrap-untrusted). Both contain the literal arg "get",
// so tests that care about one must disambiguate by "metadata" vs "full".
const goodExec: PrefetchExecFileFn = async (file, args) => {
  if (file === "gog" && args.includes("search")) return { stdout: SEARCH_ROW, stderr: "" }
  if (file === "gog" && args.includes("get") && args.includes("metadata")) {
    return { stdout: "Takeshi <takeshi@plh.life>", stderr: "" }
  }
  if (file === "gog" && args.includes("get") && args.includes("full")) {
    return { stdout: "<external-untrusted>the login button 500s</external-untrusted>", stderr: "" }
  }
  if (file === "git") return { stdout: "main", stderr: "" }
  return { stdout: "", stderr: "" }
}

describe("buildTriageEmailPrefetch", () => {
  it("includes the untrusted-wrapped body and the repo context", async () => {
    const result = await buildTriageEmailPrefetch(ctx(goodExec))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("external-untrusted")
    expect(result.text).toContain("the login button 500s")
    expect(result.text).toContain("plh-mobile")
  })

  it("always passes --readonly and --gmail-no-send to gog", async () => {
    const calls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog") calls.push(args)
      return goodExec(file, args, { cwd: "" })
    }
    await buildTriageEmailPrefetch(ctx(spy))
    expect(calls.length).toBeGreaterThan(0)
    for (const args of calls) {
      expect(args).toContain("--readonly")
      expect(args).toContain("--gmail-no-send")
    }
  })

  it("passes --wrap-untrusted and --format full when fetching the body", async () => {
    const bodyCalls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("full")) bodyCalls.push(args)
      return goodExec(file, args, { cwd: "" })
    }
    await buildTriageEmailPrefetch(ctx(spy))
    expect(bodyCalls).toHaveLength(1)
    expect(bodyCalls[0]).toContain("--wrap-untrusted")
    expect(bodyCalls[0]).toContain("--format")
    expect(bodyCalls[0]).toContain("full")
  })

  it("refuses when the allowlist is missing", async () => {
    const noConfig = async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    }
    const result = await buildTriageEmailPrefetch(ctx(goodExec, {}, noConfig))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("senders.yaml")
  })

  it("refuses when no message is from an allowlisted sender", async () => {
    const stranger: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("search")) {
        return { stdout: "ID\tDATE\tFROM\tSUBJECT\n1\t2026-08-04\tstranger@plh.life\thello", stderr: "" }
      }
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(ctx(stranger))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("allowlisted")
  })

  it("refuses when gog is unavailable", async () => {
    const noGog: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog") throw new Error("command not found: gog")
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(ctx(noGog))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("gog")
  })

  it("fetches the given messageId directly instead of searching", async () => {
    const calls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog") calls.push(args)
      return goodExec(file, args, { cwd: "" })
    }
    await buildTriageEmailPrefetch(ctx(spy, { messageId: "abc123" }))
    const searches = calls.filter((a) => a.includes("search"))
    expect(searches).toHaveLength(0)
    const bodyGets = calls.filter((a) => a.includes("get") && a.includes("full"))
    expect(bodyGets).toHaveLength(1)
    expect(bodyGets[0]).toContain("abc123")
  })

  // --- allowlist-on-both-paths fix (round 1) ---

  it("proceeds to the body fetch when a supplied messageId's sender is allowlisted", async () => {
    const result = await buildTriageEmailPrefetch(ctx(goodExec, { messageId: "abc123" }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("the login button 500s")
  })

  it("refuses a supplied messageId whose sender is not allowlisted, and never fetches the body", async () => {
    const bodyCalls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("metadata")) {
        return { stdout: "Stranger <stranger@plh.life>", stderr: "" }
      }
      if (file === "gog" && args.includes("get") && args.includes("full")) {
        bodyCalls.push(args)
      }
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(ctx(spy, { messageId: "abc123" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("allowlisted")
    // This is the assertion that would have caught the original bug: an
    // unallowlisted sender on the direct-messageId path must never reach the
    // body fetch, no matter what the metadata check decided.
    expect(bodyCalls).toHaveLength(0)
  })

  it("passes --readonly and --gmail-no-send on the metadata sender-verification call", async () => {
    const metaCalls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("metadata")) metaCalls.push(args)
      return goodExec(file, args, { cwd: "" })
    }
    await buildTriageEmailPrefetch(ctx(spy))
    expect(metaCalls.length).toBeGreaterThan(0)
    for (const args of metaCalls) {
      expect(args).toContain("--readonly")
      expect(args).toContain("--gmail-no-send")
    }
  })

  it("refuses when the metadata call's From header has no recognisable address", async () => {
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("metadata")) {
        return { stdout: "(no From header)", stderr: "" }
      }
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(ctx(spy, { messageId: "abc123" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("abc123")
  })

  it("refuses when the metadata sender-verification call fails", async () => {
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("metadata")) {
        throw new Error("gog: network error")
      }
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(ctx(spy, { messageId: "abc123" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("abc123")
  })

  it("refuses when the body fetch itself fails (metadata check already passed)", async () => {
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("full")) {
        throw new Error("gog: rate limited")
      }
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(ctx(spy, { messageId: "abc123" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("abc123")
  })
})
