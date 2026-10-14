import { describe, expect, it } from "vitest"
import { askCompanyImpl, buildAskCompanyPrompt, gatherSingleCompanyContext, type ExecFileFn } from "./ask-company-impl"
import { AI_EXECUTORS } from "./ai-executors"

function fakeExec(answer: string, stderr = ""): { exec: ExecFileFn; calls: [string, string[]][] } {
  const calls: [string, string[]][] = []
  const exec: ExecFileFn = async (command, args) => {
    calls.push([command, args])
    return { stdout: answer, stderr }
  }
  return { exec, calls }
}

const resolveExecutor = async () => AI_EXECUTORS["claude-code"]
const resolveRoot = async () => "/company/root"
/**
 * Injected by every call on purpose. The real default reads the settings file
 * under the data directory, which in a test run is the REPO's own `.data/` —
 * so omitting it makes these assertions depend on whatever persona the
 * developer happens to have saved. Green on CI, red here. v75's lesson.
 */
const noPersona = async () => null

describe("buildAskCompanyPrompt", () => {
  it("carries the question through verbatim", () => {
    expect(buildAskCompanyPrompt("who is our biggest customer?")).toContain("who is our biggest customer?")
  })

  it("asks for a short spoken answer, never a file write", () => {
    const prompt = buildAskCompanyPrompt("test")
    expect(prompt).toContain("Do not create, write, or edit any files")
  })

  it("tells it to weigh session notes and workflow history, not just static facts", () => {
    const prompt = buildAskCompanyPrompt("test")
    expect(prompt).toContain("notes/company/sessions")
    expect(prompt).toContain("Weigh that history")
  })

  it("tells it to read HANDOFF.md for what was last done", () => {
    const prompt = buildAskCompanyPrompt("test")
    expect(prompt).toContain("HANDOFF.md")
    expect(prompt).toContain("what was last done and what's still open")
  })

  it("only volunteers a suggestion when the history clearly supports one", () => {
    const prompt = buildAskCompanyPrompt("test")
    expect(prompt).toContain("only if")
    expect(prompt).toContain("otherwise just answer, with no suggestion tacked on")
  })

  it("appends preloaded company context and asks to answer in one turn when provided", () => {
    const prompt = buildAskCompanyPrompt("test", null, "## docs/company-summary.md\nAcme makes widgets.")
    expect(prompt).toContain("Preloaded company context")
    expect(prompt).toContain("Acme makes widgets.")
    expect(prompt).toContain("answer directly without calling Read, Grep, or Glob tools")
  })
})

describe("gatherSingleCompanyContext", () => {
  it("gathers company summary, handoff, recent session, and decisions when files exist", async () => {
    const files: Record<string, string> = {
      "/fake/docs/company-summary.md": "# Acme\nAcme widgets",
      "/fake/HANDOFF.md": "# Handoff\nFinished feature X",
      "/fake/notes/company/sessions/2026-09-01-session.md": "# Session\nDid A and B",
      "/fake/docs/decisions/2026-09-01-auth.md": "# Decision\nUse JWT",
    }
    const mockReadFile = async (p: string) => {
      if (files[p]) return files[p]
      throw new Error(`ENOENT: ${p}`)
    }
    const mockReadDir = async (dir: string) => {
      if (dir === "/fake/notes/company/sessions") return ["2026-09-01-session.md"]
      if (dir === "/fake/docs/decisions") return ["2026-09-01-auth.md"]
      return []
    }

    const context = await gatherSingleCompanyContext("/fake", mockReadFile, mockReadDir)
    expect(context).toContain("## docs/company-summary.md\n# Acme\nAcme widgets")
    expect(context).toContain("## HANDOFF.md (latest entry)\n# Handoff\nFinished feature X")
    expect(context).toContain("## notes/company/sessions/2026-09-01-session.md\n# Session\nDid A and B")
    expect(context).toContain("## docs/decisions/2026-09-01-auth.md\n# Decision\nUse JWT")
  })

  it("gathers live operational records, retros, and metrics when available", async () => {
    const transactionsYaml = `records:
  - id: tx-1
    type: income
    amount: 50000
  - id: tx-2
    type: expense
    amount: 12000`

    const leadsYaml = `records:
  - id: lead-1
    stage: qualified
    value: 80000`

    const retroMd = `# Retro: Q3 Review\nShipped all milestones on time.`

    const files: Record<string, string> = {
      "/fake/records/finances/transactions.yaml": transactionsYaml,
      "/fake/records/funnel/leads.yaml": leadsYaml,
      "/fake/docs/retros/2026-09-01-q3.md": retroMd,
    }
    const mockReadFile = async (p: string) => {
      if (files[p]) return files[p]
      throw new Error(`ENOENT: ${p}`)
    }
    const mockReadDir = async (dir: string) => {
      if (dir === "/fake/records") return ["finances", "funnel"]
      if (dir === "/fake/docs/retros") return ["2026-09-01-q3.md"]
      return []
    }

    const context = await gatherSingleCompanyContext("/fake", mockReadFile, mockReadDir)
    expect(context).toContain("## docs/retros/2026-09-01-q3.md")
    expect(context).toContain("Shipped all milestones on time.")
    expect(context).toContain("## Live Operational Records & Metrics")
    expect(context).toContain("Ledger Balance: $38,000")
    expect(context).toContain("Pipeline: $80,000 across 1 active deal(s)")
    expect(context).toContain("Departments: Finances, Funnel")
  })

  it("names the current name and real folder of a defined department, and leaves a folder without a definition as its title", async () => {
    const files: Record<string, string> = {
      "/fake/definitions/departments.yaml": `departments:\n  - slug: sales-ops\n    name: Revenue Team\n    purpose: Deals.\n    color: "#0369a1"\n`,
    }
    const mockReadFile = async (p: string) => {
      if (files[p]) return files[p]
      throw new Error(`ENOENT: ${p}`)
    }
    const mockReadDir = async (dir: string) => (dir === "/fake/records" ? ["sales-ops", "finances"] : [])

    const context = await gatherSingleCompanyContext("/fake", mockReadFile, mockReadDir)
    expect(context).toContain("Departments: Revenue Team (folder: sales-ops), Finances")
  })

  it("gracefully returns empty string if no files exist", async () => {
    const mockReadFile = async () => {
      throw new Error("ENOENT")
    }
    const mockReadDir = async () => []

    const context = await gatherSingleCompanyContext("/nonexistent", mockReadFile, mockReadDir)
    expect(context).toBe("")
  })
})

describe("askCompanyImpl", () => {
  it("returns the executor's answer, trimmed", async () => {
    const { exec } = fakeExec("  We mostly serve small bakeries.  \n")
    const result = await askCompanyImpl("acme", "who do we serve?", undefined, resolveExecutor, exec, resolveRoot, noPersona)
    expect(result).toEqual({ ok: true, answer: "We mostly serve small bakeries." })
  })

  it("scopes edits to a path nothing writes to, never the repo itself", async () => {
    const { exec, calls } = fakeExec("fine")
    await askCompanyImpl("acme", "test", undefined, resolveExecutor, exec, resolveRoot, noPersona)
    const [command, args] = calls[0]
    expect(command).toBe("claude")
    expect(args.join(" ")).toContain("Edit(.alacran-never-written/**)")
    expect(args).toContain("--disallowedTools")
  })

  it("refuses an empty question without spawning anything", async () => {
    const { exec, calls } = fakeExec("unused")
    const result = await askCompanyImpl("acme", "   ", undefined, resolveExecutor, exec, resolveRoot, noPersona)
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it("refuses an unreasonably long question without spawning anything", async () => {
    const { exec, calls } = fakeExec("unused")
    const result = await askCompanyImpl("acme", "x".repeat(3000), undefined, resolveExecutor, exec, resolveRoot, noPersona)
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it("reports an unknown company without spawning anything", async () => {
    const { exec, calls } = fakeExec("unused")
    const result = await askCompanyImpl(
      "ghost",
      "test",
      undefined,
      resolveExecutor,
      exec,
      async () => undefined,
      noPersona
    )
    expect(result).toEqual({ ok: false, message: 'Unknown company "ghost"' })
    expect(calls).toHaveLength(0)
  })

  it("reports the executor's stderr when it exits with no answer", async () => {
    const { exec } = fakeExec("", "disk is full")
    const result = await askCompanyImpl("acme", "test", undefined, resolveExecutor, exec, resolveRoot, noPersona)
    expect(result).toEqual({ ok: false, message: "disk is full" })
  })

  it("surfaces a thrown error's stdout/stderr rather than a bare exception message", async () => {
    const exec: ExecFileFn = async () => {
      throw Object.assign(new Error("Command failed"), { stdout: "", stderr: "file is locked" })
    }
    const result = await askCompanyImpl("acme", "test", undefined, resolveExecutor, exec, resolveRoot, noPersona)
    expect(result).toEqual({ ok: false, message: "file is locked" })
  })

  it("explains a missing executor in plain words instead of the raw spawn error", async () => {
    const exec: ExecFileFn = async () => {
      throw Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" })
    }
    const result = await askCompanyImpl("acme", "test", undefined, resolveExecutor, exec, resolveRoot, noPersona)
    expect(result).toEqual({ ok: false, message: expect.stringMatching(/isn't installed on this computer yet/) })
  })

  it("honors overrideExecutorId instead of resolving the company's default", async () => {
    const { exec, calls } = fakeExec("answer")
    await askCompanyImpl(
      "acme",
      "test",
      undefined,
      resolveExecutor,
      exec,
      resolveRoot,
      noPersona,
      "google-antigravity"
    )
    expect(calls[0][0]).toBe("agy")
  })
})

describe("askCwdFor", () => {
  it("runs a scope-enforcing agent in the company folder, any other in the empty assistant folder", async () => {
    const { askCwdFor, assistantWorkspaceDir } = await import("./ask-company-impl")
    const { AI_EXECUTORS } = await import("./ai-executors")
    for (const executor of Object.values(AI_EXECUTORS)) {
      if (executor.enforcesToolScope) {
        expect(await askCwdFor(executor, "/co")).toEqual({ cwd: "/co", fileAccess: true })
      } else {
        expect(await askCwdFor(executor, "/co")).toEqual({ cwd: assistantWorkspaceDir(), fileAccess: false })
      }
    }
  })

  it("tells a sandboxed run it has no file access", async () => {
    const { buildAskCompanyPrompt } = await import("./ask-company-impl")
    expect(buildAskCompanyPrompt("q", null, "ctx", false)).toContain("You have no file access in this run")
    expect(buildAskCompanyPrompt("q", null, "ctx")).not.toContain("You have no file access in this run")
  })
})

describe("askCompanyImpl — knowledge other companies share", () => {
  const noContext = async () => "OWN MEMORY"
  const noLocal = async () => null

  it("adds what other companies share after the company's own memory, and names it for the answer", async () => {
    const { exec, calls } = fakeExec("ok")
    await askCompanyImpl(
      "acme", "what does Beta do?", undefined, resolveExecutor, exec, resolveRoot, noPersona, undefined,
      noContext, noLocal, async () => "## Knowledge other companies share with Acme\nBeta sells anvils."
    )
    const prompt = calls[0][1].join("\n")
    expect(prompt).toContain("OWN MEMORY")
    expect(prompt).toContain("Beta sells anvils.")
    expect(prompt.indexOf("OWN MEMORY")).toBeLessThan(prompt.indexOf("Beta sells anvils."))
  })

  it("sends exactly what it sent before when no string points at the company", async () => {
    const withNone = fakeExec("ok")
    await askCompanyImpl("acme", "q", undefined, resolveExecutor, withNone.exec, resolveRoot, noPersona, undefined, noContext, noLocal, async () => "")
    const baseline = fakeExec("ok")
    await askCompanyImpl("acme", "q", undefined, resolveExecutor, baseline.exec, resolveRoot, noPersona, undefined, noContext, noLocal, async () => "")
    expect(withNone.calls[0][1].join("\n")).toBe(baseline.calls[0][1].join("\n"))
    expect(withNone.calls[0][1].join("\n")).not.toContain("Knowledge other companies share")
  })
})


describe("askCompanyImpl — fast (voice) option", () => {
  const noContext = async () => "OWN MEMORY"
  const noLocal = async () => null
  const noShared = async () => ""
  const run = async (executor: typeof AI_EXECUTORS["claude-code"], options?: { fast?: boolean }) => {
    const { exec, calls } = fakeExec("ok")
    await askCompanyImpl(
      "acme", "q", undefined, async () => executor, exec, resolveRoot, noPersona, undefined,
      noContext, noLocal, noShared, options
    )
    return calls[0][1]
  }
  const quick = { ...AI_EXECUTORS["claude-code"], routineModelArgs: ["--model", "haiku"] }
  const none = { ...AI_EXECUTORS["claude-code"], routineModelArgs: null }

  it("appends the quick-model args when fast", async () => {
    const args = await run(quick, { fast: true })
    expect(args.slice(-2)).toEqual(["--model", "haiku"])
  })

  it("leaves the args alone when fast is omitted or false", async () => {
    expect(await run(quick)).not.toContain("haiku")
    expect(await run(quick, { fast: false })).not.toContain("haiku")
  })

  it("leaves the args unchanged when the executor has no quick model", async () => {
    expect(await run(none, { fast: true })).toEqual(await run(none))
  })
})
