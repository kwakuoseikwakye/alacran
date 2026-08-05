import { describe, it, expect } from "vitest"
import { buildTriageIssuePrefetch, parseIssueRef } from "./triage-issue"
import type { PrefetchContext, PrefetchExecFileFn } from "./types"

const REPOS = "repos:\n  - name: plh-mobile\n    path: /r/plh-mobile\n    description: Mobile app\n"
const configReader = async (p: string) => {
  if (p.endsWith("repos.yaml")) return REPOS
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
}

const goodExec: PrefetchExecFileFn = async (file, _args) => {
  if (file === "gh") return { stdout: "title: login 500s\nbody: tapping login returns 500", stderr: "" }
  if (file === "git") return { stdout: "main", stderr: "" }
  return { stdout: "", stderr: "" }
}

function ctx(execFn: PrefetchExecFileFn, fieldValues: Record<string, string>) {
  return { agentRootPath: "/c", fieldValues, execFn, readFileFn: configReader } as PrefetchContext
}

describe("parseIssueRef", () => {
  it("parses owner/repo#123", () => {
    expect(parseIssueRef("kwakuoseikwakye/plh-mobile#42")).toEqual({
      repo: "kwakuoseikwakye/plh-mobile",
      number: "42",
    })
  })

  it("parses a full GitHub URL", () => {
    expect(parseIssueRef("https://github.com/kwakuoseikwakye/plh-mobile/issues/42")).toEqual({
      repo: "kwakuoseikwakye/plh-mobile",
      number: "42",
    })
  })

  it("rejects a bare number", () => {
    expect(parseIssueRef("42")).toBeNull()
  })

  it("rejects a non-numeric issue number", () => {
    expect(parseIssueRef("owner/repo#abc")).toBeNull()
  })

  it("rejects a shell-metacharacter injection attempt", () => {
    expect(parseIssueRef("owner/repo#42; rm -rf /")).toBeNull()
  })

  it("rejects an empty string", () => {
    expect(parseIssueRef("")).toBeNull()
  })
})

describe("buildTriageIssuePrefetch", () => {
  it("includes the issue text and the repo context", async () => {
    const result = await buildTriageIssuePrefetch(ctx(goodExec, { issue: "o/plh-mobile#42" }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.text).toContain("tapping login returns 500")
    expect(result.text).toContain("plh-mobile")
  })

  it("refuses an unparseable reference", async () => {
    const result = await buildTriageIssuePrefetch(ctx(goodExec, { issue: "nonsense" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("owner/repo#123")
  })

  it("refuses when gh is unavailable", async () => {
    const noGh: PrefetchExecFileFn = async (file, args) => {
      if (file === "gh") throw new Error("command not found: gh")
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageIssuePrefetch(ctx(noGh, { issue: "o/plh-mobile#42" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("gh")
  })

  it("refuses when gh returns empty issue output, and never proceeds to repo context", async () => {
    const gitCalls: string[][] = []
    const emptyExec: PrefetchExecFileFn = async (file, args) => {
      if (file === "gh") return { stdout: "   \n", stderr: "" }
      if (file === "git") gitCalls.push(args)
      return goodExec(file, args, { cwd: "" })
    }
    const result = await buildTriageIssuePrefetch(ctx(emptyExec, { issue: "o/plh-mobile#42" }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    // Exact match (not just toContain) so this can only pass via the
    // `issueText === ""` refusal branch — the gh-unavailable catch block
    // produces a differently-worded message ("Could not read ... with gh:"),
    // so a false pass from the wrong branch is not possible here.
    expect(result.message).toBe("o/plh-mobile#42 returned nothing — check the reference.")
    expect(gitCalls).toHaveLength(0)
  })

  it("fences the whole issue payload inside control-panel-emitted markers, with the reference outside", async () => {
    // Same fence as triage-email: the issue title and body are written by whoever
    // filed the issue, so they can forge an `</external-untrusted>` or a plausible
    // `--- repo context ... ---` line. Only the per-run nonce they cannot guess
    // closes the region.
    const result = await buildTriageIssuePrefetch(ctx(goodExec, { issue: "o/plh-mobile#42" }))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const open = /--- UNTRUSTED:([0-9a-f]{16}) ---\n/.exec(result.text)
    expect(open).not.toBeNull()
    if (!open) return
    const nonce = open[1]
    const closer = `\n--- END UNTRUSTED:${nonce} ---`
    const start = open.index + open[0].length
    const end = result.text.indexOf(closer, start)
    expect(end).toBeGreaterThan(start)

    const before = result.text.slice(0, open.index)
    const inside = result.text.slice(start, end)
    const after = result.text.slice(end + closer.length)

    expect(inside).toContain("tapping login returns 500")
    expect(before).not.toContain("tapping login returns 500")
    // The reference itself came from the operator through parseIssueRef's strict
    // shape validation, so it is control-panel-resolved and may stay outside.
    expect(before).toContain("o/plh-mobile#42")
    expect(after).toContain("repo context")
  })

  it("never invokes a mutating gh subcommand", async () => {
    const calls: string[][] = []
    const spy: PrefetchExecFileFn = async (file, args) => {
      if (file === "gh") calls.push(args)
      return goodExec(file, args, { cwd: "" })
    }
    await buildTriageIssuePrefetch(ctx(spy, { issue: "o/plh-mobile#42" }))
    expect(calls.length).toBeGreaterThan(0)
    for (const args of calls) {
      expect(args).toContain("view")
      expect(args).not.toContain("create")
      expect(args).not.toContain("comment")
      expect(args).not.toContain("edit")
      expect(args).not.toContain("close")
    }
  })
})
