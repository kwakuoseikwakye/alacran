import { describe, expect, it } from "vitest"
import { buildHandoffPrefetch } from "./handoff"
import type { PrefetchContext } from "./types"

function ctxWith(answer: (args: string[]) => string, calls: string[][] = []): PrefetchContext {
  return {
    agentRootPath: "/tmp/co",
    fieldValues: {},
    execFn: async (_file, args) => {
      calls.push(args)
      return { stdout: answer(args), stderr: "" }
    },
  }
}

describe("buildHandoffPrefetch", () => {
  it("gathers status, diff stat and new decisions, and avoids git's optional lock on every call", async () => {
    const calls: string[][] = []
    const out = await buildHandoffPrefetch(
      ctxWith((args) => {
        if (args.includes("status")) return " M notes/a.md\n?? docs/b.md\n"
        if (args.includes("--stat")) return " notes/a.md | 3 ++-\n"
        if (args.includes("--diff-filter=A")) return "docs/decisions/2026-10-08-pick-a-db.md\n"
        return "abc123\n"
      }, calls)
    )
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.text).toContain("M notes/a.md")
    expect(out.text).toContain("notes/a.md | 3")
    expect(out.text).toContain("2026-10-08-pick-a-db.md")
    expect(calls.every((a) => a[0] === "--no-optional-locks")).toBe(true)
  })

  it("says so, rather than claiming HANDOFF.md has no history, when the history lookup itself fails", async () => {
    const out = await buildHandoffPrefetch({
      agentRootPath: "/tmp/co",
      fieldValues: {},
      execFn: async (_file, args) => {
        if (args.includes("--format=%H")) throw new Error("fatal: bad object")
        if (args.includes("--name-only")) return { stdout: "docs/decisions/2026-10-08-pick-a-db.md\n", stderr: "" }
        return { stdout: "", stderr: "" }
      },
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.text).toContain("couldn't read HANDOFF.md's history, so all of them")
    expect(out.text).not.toContain("HANDOFF.md has no history")
    expect(out.text).toContain("2026-10-08-pick-a-db.md")
  })

  it("keeps the plain 'no history' heading when git answers but HANDOFF.md was never committed", async () => {
    const out = await buildHandoffPrefetch(ctxWith(() => ""))
    expect(out.ok && out.text).toContain("HANDOFF.md has no history, so all of them")
  })

  it("cuts a long listing at 80 lines and says how many it dropped", async () => {
    const files = Array.from({ length: 100 }, (_, i) => ` M file-${i + 1}.md`).join("\n")
    const out = await buildHandoffPrefetch(ctxWith((args) => (args.includes("status") ? `${files}\n` : "")))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.text).toContain("file-80.md")
    expect(out.text).not.toContain("file-81.md")
    expect(out.text).toContain("… [20 more lines]")
  })

  it("says plainly when git cannot answer, instead of failing the run", async () => {
    const ctx: PrefetchContext = {
      agentRootPath: "/tmp/co",
      fieldValues: {},
      execFn: async () => {
        throw new Error("not a git repository")
      },
    }
    const out = await buildHandoffPrefetch(ctx)
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.text).toMatch(/unable to read/i)
  })
})
