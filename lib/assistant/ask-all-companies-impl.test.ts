import { describe, expect, it } from "vitest"
import {
  askAllCompaniesImpl,
  buildAskAllCompaniesPrompt,
  resolveSharedExecutorId,
} from "./ask-all-companies-impl"
import type { CompanyContext, DecisionIndexEntry } from "./gather-all-companies"
import type { ExecFileFn } from "../ask-company-impl"
import type { AiExecutorId } from "../ai-executors"

const ctx = (id: string, over: Partial<CompanyContext> = {}): CompanyContext => ({
  id,
  name: `${id} Co`,
  kind: "command-set",
  source: "summary",
  text: `${id} sells things`,
  truncated: false,
  ...over,
})

function fakeExec(stdout: string, stderr = ""): { exec: ExecFileFn; calls: [string, string[], string][] } {
  const calls: [string, string[], string][] = []
  const exec: ExecFileFn = async (command, args, options) => {
    calls.push([command, args, options.cwd])
    return { stdout, stderr }
  }
  return { exec, calls }
}

const gather = (contexts: CompanyContext[]) => (async () => contexts) as never
/** Injected by every call — see the same constant in ask-company-impl.test.ts
 *  for why the real default must never run in a test. */
const noPersona = async () => null

describe("buildAskAllCompaniesPrompt", () => {
  it("carries the question and every company's own text", () => {
    const prompt = buildAskAllCompaniesPrompt("who is busiest?", [ctx("a"), ctx("b")])
    expect(prompt).toContain("who is busiest?")
    expect(prompt).toContain("a sells things")
    expect(prompt).toContain("b sells things")
  })

  it("demands attribution, which is what stops a fact crossing companies", () => {
    expect(buildAskAllCompaniesPrompt("q", [ctx("a")])).toContain("Name the company any claim comes from")
  })

  it("tells the agent it has no file access, so it cannot offer to go and look", () => {
    expect(buildAskAllCompaniesPrompt("q", [ctx("a")])).toContain("no file access")
  })

  it("forbids writing", () => {
    expect(buildAskAllCompaniesPrompt("q", [ctx("a")])).toContain("Do not create, write, or edit any files")
  })

  it("instructs a proactive morning briefing when isInitialGreeting is true", () => {
    const prompt = buildAskAllCompaniesPrompt("", [ctx("a")], null, { isInitialGreeting: true })
    expect(prompt).toContain("morning briefing summarizing the current operational pulse")
    expect(prompt).toContain("highlight any pending reviews")
  })

  it("compresses non-focal companies when question mentions a specific company", () => {
    const acme = ctx("acme", { name: "Acme", text: "Acme sells anvils and rockets with extensive descriptions." })
    const beta = ctx("beta", { name: "Beta", text: "Beta makes software and SaaS widgets with extensive features." })
    const prompt = buildAskAllCompaniesPrompt("What is Acme's status?", [acme, beta])
    expect(prompt).toContain("Acme sells anvils and rockets")
    expect(prompt).toContain("Summary (brief): Beta makes software")
  })

  it("includes Cross-Company Decision Index when provided in options", () => {
    const sampleDecisions: DecisionIndexEntry[] = [
      {
        companyId: "a",
        companyName: "a Co",
        slug: "use-stripe",
        title: "Use Stripe for Billing",
      },
    ]
    const prompt = buildAskAllCompaniesPrompt("How should we bill?", [ctx("a")], null, {
      crossCompanyDecisions: sampleDecisions,
    })
    expect(prompt).toContain("Cross-Company Decision Index")
    expect(prompt).toContain("Use Stripe for Billing")
  })
})


describe("resolveSharedExecutorId", () => {
  it("uses the shared executor when every company agrees", async () => {
    // A user who moved everything to Kiro must not have a cross-company
    // question silently answered by Claude Code — on a machine without
    // `claude` installed the default would not even spawn.
    expect(await resolveSharedExecutorId([ctx("a"), ctx("b")], async () => "kiro")).toBe("kiro")
  })

  it("falls back to the default on a mixed machine, where there is no right answer", async () => {
    const perAgent = async (id: string): Promise<AiExecutorId> => (id === "a" ? "kiro" : "claude-code")
    expect(await resolveSharedExecutorId([ctx("a"), ctx("b")], perAgent, async () => "claude-code")).toBe("claude-code")
  })

  it("uses the configured assistant executor on a mixed machine", async () => {
    const perAgent = async (id: string): Promise<AiExecutorId> => (id === "a" ? "kiro" : "claude-code")
    expect(await resolveSharedExecutorId([ctx("a"), ctx("b")], perAgent, async () => "google-antigravity")).toBe(
      "google-antigravity"
    )
  })
})

describe("askAllCompaniesImpl", () => {
  it("returns the answer, trimmed", async () => {
    const { exec } = fakeExec("  Acme is busiest.  \n")
    const result = await askAllCompaniesImpl("who is busiest?", undefined, gather([ctx("a")]), async () => "claude-code", exec, "/tmp/assistant-test", noPersona)
    expect(result).toEqual({ ok: true, answer: "Acme is busiest." })
  })

  it("spawns in the given workspace dir, never a company root", async () => {
    const { exec, calls } = fakeExec("fine")
    await askAllCompaniesImpl("q", undefined, gather([ctx("a")]), async () => "claude-code", exec, "/tmp/assistant-test", noPersona)
    expect(calls[0][2]).toBe("/tmp/assistant-test")
  })

  it("scopes edits to a path nothing writes to, and bans Bash", async () => {
    const { exec, calls } = fakeExec("fine")
    await askAllCompaniesImpl("q", undefined, gather([ctx("a")]), async () => "claude-code", exec, "/tmp/assistant-test", noPersona)
    const args = calls[0][1]
    expect(args.join(" ")).toContain("Edit(.alacran-never-written/**)")
    expect(args).toContain("--disallowedTools")
  })

  it("refuses an empty question without spawning", async () => {
    const { exec, calls } = fakeExec("unused")
    const result = await askAllCompaniesImpl("  ", undefined, gather([ctx("a")]), async () => "claude-code", exec, "/tmp/x", noPersona)
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it("refuses an over-long question without spawning", async () => {
    const { exec, calls } = fakeExec("unused")
    const result = await askAllCompaniesImpl("x".repeat(3000), undefined, gather([ctx("a")]), async () => "claude-code", exec, "/tmp/x", noPersona)
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it("says there is nothing to ask about when no companies exist, rather than spawning", async () => {
    const { exec, calls } = fakeExec("unused")
    const result = await askAllCompaniesImpl("q", undefined, gather([]), async () => "claude-code", exec, "/tmp/x", noPersona)
    expect(result).toEqual({ ok: false, message: "There are no companies on this computer yet. Add one first." })
    expect(calls).toHaveLength(0)
  })

  it("reports stderr when the executor exits with no answer", async () => {
    const { exec } = fakeExec("", "disk is full")
    const result = await askAllCompaniesImpl("q", undefined, gather([ctx("a")]), async () => "claude-code", exec, "/tmp/x", noPersona)
    expect(result).toEqual({ ok: false, message: "disk is full" })
  })

  it("surfaces a thrown error's stderr rather than a bare exception message", async () => {
    const exec: ExecFileFn = async () => {
      throw Object.assign(new Error("Command failed"), { stdout: "", stderr: "file is locked" })
    }
    const result = await askAllCompaniesImpl("q", undefined, gather([ctx("a")]), async () => "claude-code", exec, "/tmp/x", noPersona)
    expect(result).toEqual({ ok: false, message: "file is locked" })
  })

  it("honors overrideExecutorId and spawns that executor's binary", async () => {
    const { exec, calls } = fakeExec("fine")
    await askAllCompaniesImpl(
      "who is busiest?",
      undefined,
      gather([ctx("a")]),
      async () => "claude-code",
      exec,
      "/tmp/assistant-test",
      noPersona,
      "google-antigravity"
    )
    expect(calls[0][0]).toBe("agy")
  })

  it("spawns a morning briefing when isInitialGreeting is true and question is empty", async () => {
    const { exec, calls } = fakeExec("Good morning. Everything is running smoothly.")
    const result = await askAllCompaniesImpl(
      "",
      undefined,
      gather([ctx("a")]),
      async () => "claude-code",
      exec,
      "/tmp/assistant-test",
      noPersona,
      undefined,
      undefined,
      { isInitialGreeting: true }
    )
    expect(result).toEqual({ ok: true, answer: "Good morning. Everything is running smoothly." })
    expect(calls).toHaveLength(1)
    const promptArg = calls[0][1].join(" ")
    expect(promptArg).toContain("morning briefing")
  })

  it("gathers cross-company decisions and supplies them to the prompt", async () => {
    const { exec, calls } = fakeExec("We use Stripe for payments.")
    const sampleDecisions: DecisionIndexEntry[] = [
      {
        companyId: "acme",
        companyName: "Acme",
        slug: "use-stripe",
        title: "Use Stripe for Billing",
      },
    ]
    const mockGatherDecisions = async () => sampleDecisions
    const result = await askAllCompaniesImpl(
      "How do we handle payments?",
      undefined,
      gather([ctx("acme")]),
      async () => "claude-code",
      exec,
      "/tmp/assistant-test",
      noPersona,
      undefined,
      undefined,
      undefined,
      mockGatherDecisions
    )
    expect(result).toEqual({ ok: true, answer: "We use Stripe for payments." })
    expect(calls).toHaveLength(1)
    const promptArg = calls[0][1].join(" ")
    expect(promptArg).toContain("Cross-Company Decision Index")
    expect(promptArg).toContain("Use Stripe for Billing")
  })
})


describe("askAllCompaniesImpl — fast (voice) option", () => {
  // The executor is resolved by id, so the real registry decides: claude-code
  // has a quick model, kiro has none.
  const run = async (id: AiExecutorId, fast?: boolean) => {
    const { exec, calls } = fakeExec("ok")
    await askAllCompaniesImpl(
      "q", undefined, gather([ctx("a")]), async () => id, exec, "/tmp/assistant-test", noPersona,
      undefined, async () => id, fast === undefined ? undefined : { fast }, async () => []
    )
    return calls[0][1]
  }

  it("appends the executor's quick-model args when fast", async () => {
    expect((await run("claude-code", true)).slice(-2)).toEqual(["--model", "haiku"])
  })

  it("leaves the args alone when fast is omitted or false", async () => {
    expect(await run("claude-code")).not.toContain("haiku")
    expect(await run("claude-code", false)).not.toContain("haiku")
  })

  it("leaves the args unchanged when the executor has no quick model", async () => {
    expect(await run("kiro", true)).toEqual(await run("kiro"))
  })
})
