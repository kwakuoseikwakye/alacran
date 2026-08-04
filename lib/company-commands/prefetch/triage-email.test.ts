import { describe, it, expect } from "vitest"
import { buildTriageEmailPrefetch } from "./triage-email"
import type { PrefetchContext, PrefetchExecFileFn } from "./types"

const SENDERS = "senders:\n  - owner@example.com\n"
const REPOS = "repos:\n  - name: plh-mobile\n    path: /r/plh-mobile\n    description: Mobile app\n"

const configReader = async (p: string) => {
  if (p.endsWith("senders.yaml")) return SENDERS
  if (p.endsWith("repos.yaml")) return REPOS
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
}

const SEARCH_ROW = "ID\tDATE\tFROM\tSUBJECT\n19f0\t2026-08-04\towner@example.com\tplh-mobile login broken"

function ctx(
  execFn: PrefetchExecFileFn,
  fieldValues: Record<string, string> = {},
  readFileFn: (p: string) => Promise<string> = configReader
): PrefetchContext {
  return { agentRootPath: "/c", fieldValues, execFn, readFileFn }
}

const goodExec: PrefetchExecFileFn = async (file, args) => {
  if (file === "gog" && args.includes("search")) return { stdout: SEARCH_ROW, stderr: "" }
  if (file === "gog" && args.includes("get")) {
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
    const getCalls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get")) getCalls.push(args)
      return goodExec(file, args, { cwd: "" })
    }
    await buildTriageEmailPrefetch(ctx(spy))
    expect(getCalls).toHaveLength(1)
    expect(getCalls[0]).toContain("--wrap-untrusted")
    expect(getCalls[0]).toContain("--format")
    expect(getCalls[0]).toContain("full")
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
        return { stdout: "ID\tDATE\tFROM\tSUBJECT\n1\t2026-08-04\tstranger@example.com\thello", stderr: "" }
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
    const gets = calls.filter((a) => a.includes("get"))
    expect(gets).toHaveLength(1)
    expect(gets[0]).toContain("abc123")
  })
})
