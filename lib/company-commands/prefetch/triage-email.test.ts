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

/**
 * Splits prefetch output on the control-panel-emitted fence. Deliberately not
 * exported from the module under test: the tests should break if the emitted
 * shape changes, rather than silently following it.
 */
function splitOnFence(text: string): { nonce: string; before: string; inside: string; after: string } | null {
  const open = /--- UNTRUSTED:([0-9a-f]{16}) ---\n/.exec(text)
  if (!open) return null
  const nonce = open[1]
  const closer = `\n--- END UNTRUSTED:${nonce} ---`
  const start = open.index + open[0].length
  const end = text.indexOf(closer, start)
  if (end === -1) return null
  return {
    nonce,
    before: text.slice(0, open.index),
    inside: text.slice(start, end),
    after: text.slice(end + closer.length),
  }
}

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
    return { stdout: "Owner <owner@example.com>", stderr: "" }
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
        return { stdout: "Stranger <stranger@example.com>", stderr: "" }
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

  it("refuses when the body fetch returns an empty body, after the sender check already passed", async () => {
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("full")) {
        return { stdout: "   \n", stderr: "" }
      }
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(ctx(spy, { messageId: "abc123" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    // Exact match so this can only pass via the `body === ""` refusal branch —
    // the metadata-failure and body-fetch-throw branches produce differently
    // worded messages, so a false pass from the wrong branch isn't possible.
    expect(result.message).toBe("Message abc123 returned an empty body — nothing to analyse.")
  })

  // --- framing fixes (round 2) ---

  it("refuses a From header carrying more than one address, and never fetches the body", async () => {
    // `From: Evil <evil@attacker.com> owner@example.com` — the old last-match
    // extractor resolved this to the allowlisted address and accepted it, while an
    // RFC 5322 parser resolves the real sender to evil@attacker.com. Ambiguous
    // now means refused, on the authoritative gate.
    const bodyCalls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("metadata")) {
        return { stdout: "Evil <evil@attacker.com> owner@example.com", stderr: "" }
      }
      if (file === "gog" && args.includes("get") && args.includes("full")) bodyCalls.push(args)
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(ctx(spy, { messageId: "abc123" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("abc123")
    expect(bodyCalls).toHaveLength(0)
  })

  it("fences every sender-supplied field — from, date, subject and body — inside control-panel-emitted markers", async () => {
    const result = await buildTriageEmailPrefetch(ctx(goodExec))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parts = splitOnFence(result.text)
    expect(parts).not.toBeNull()
    if (!parts) return

    // Everything the sender controls is inside the fence.
    expect(parts.inside).toContain("owner@example.com")
    expect(parts.inside).toContain("2026-08-04")
    expect(parts.inside).toContain("plh-mobile login broken")
    expect(parts.inside).toContain("the login button 500s")

    // The region the prompt presents as trustworthy carries only what the control
    // panel itself resolved — the message id — and none of the sender's text.
    expect(parts.before).toContain("19f0")
    expect(parts.before).not.toContain("owner@example.com")
    expect(parts.before).not.toContain("plh-mobile login broken")
    expect(parts.before).not.toContain("the login button 500s")

    // Repo context stays outside, after the close marker.
    expect(parts.after).toContain("repo context")
  })

  it("uses a fresh nonce on each run, so wrapped content cannot have learned it", async () => {
    const a = await buildTriageEmailPrefetch(ctx(goodExec))
    const b = await buildTriageEmailPrefetch(ctx(goodExec))
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    const nonceA = splitOnFence(a.text)?.nonce
    const nonceB = splitOnFence(b.text)?.nonce
    expect(nonceA).toBeTruthy()
    expect(nonceB).toBeTruthy()
    expect(nonceA).not.toBe(nonceB)
  })

  it("fences the sender's headers on the direct-messageId path too", async () => {
    const result = await buildTriageEmailPrefetch(ctx(goodExec, { messageId: "abc123" }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parts = splitOnFence(result.text)
    expect(parts).not.toBeNull()
    if (!parts) return
    expect(parts.inside).toContain("owner@example.com")
    expect(parts.inside).toContain("the login button 500s")
    expect(parts.before).toContain("abc123")
    expect(parts.before).not.toContain("owner@example.com")
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

  // --- multi-account ---

  function ctxWithAccounts(execFn: PrefetchExecFileFn, accounts: string[], fieldValues: Record<string, string> = {}): PrefetchContext {
    return { agentRootPath: "/c", fieldValues, execFn, readFileFn: configReader, accounts }
  }

  it("searches the second configured account when the first has no allowlisted match", async () => {
    const searchCalls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("search")) {
        searchCalls.push(args)
        const account = args[args.indexOf("-a") + 1]
        if (account === "second@example.com") return { stdout: SEARCH_ROW, stderr: "" }
        return { stdout: "ID\tDATE\tFROM\tSUBJECT\n", stderr: "" }
      }
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(ctxWithAccounts(spy, ["first@example.com", "second@example.com"]))
    expect(result.ok).toBe(true)
    expect(searchCalls).toHaveLength(2)
    expect(searchCalls[0]).toContain("first@example.com")
    expect(searchCalls[1]).toContain("second@example.com")
  })

  it("fetches metadata/body with the account the matching search row came from", async () => {
    const calls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog") calls.push(args)
      if (file === "gog" && args.includes("search")) {
        const account = args[args.indexOf("-a") + 1]
        if (account === "second@example.com") return { stdout: SEARCH_ROW, stderr: "" }
        return { stdout: "ID\tDATE\tFROM\tSUBJECT\n", stderr: "" }
      }
      return goodExec(file, args, { cwd: "" })
    }
    await buildTriageEmailPrefetch(ctxWithAccounts(spy, ["first@example.com", "second@example.com"]))
    const metaCall = calls.find((a) => a.includes("get") && a.includes("metadata"))
    const bodyCall = calls.find((a) => a.includes("get") && a.includes("full"))
    expect(metaCall).toContain("second@example.com")
    expect(bodyCall).toContain("second@example.com")
  })

  it("tries each configured account for a direct messageId until one resolves", async () => {
    const metaCalls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("metadata")) {
        metaCalls.push(args)
        const account = args[args.indexOf("-a") + 1]
        if (account === "first@example.com") throw new Error("no such message on this account")
        return { stdout: "Owner <owner@example.com>", stderr: "" }
      }
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(
      ctxWithAccounts(spy, ["first@example.com", "second@example.com"], { messageId: "abc123" })
    )
    expect(result.ok).toBe(true)
    expect(metaCalls).toHaveLength(2)
  })

  it("refuses a direct messageId not found on any configured account", async () => {
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gog" && args.includes("get") && args.includes("metadata")) {
        throw new Error("not found")
      }
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageEmailPrefetch(
      ctxWithAccounts(spy, ["first@example.com", "second@example.com"], { messageId: "abc123" })
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("abc123")
    expect(result.message).toContain("first@example.com")
    expect(result.message).toContain("second@example.com")
  })
})
