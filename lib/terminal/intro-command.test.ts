import { vi, describe, it, expect } from "vitest"
import { buildAssistantLaunch } from "./intro-command"
import { AI_EXECUTORS, type AiExecutor } from "../ai-executors"
import { COMPANY_SUMMARY_PATH, buildReturningAssistantPrompt } from "../company-summary"

// The Outlook status writes a launcher into ~/.local/bin and runs the real
// command; a test must never touch the developer's home (v220 did, once).
vi.mock("@/lib/outlook/outlook", () => ({
  OUTLOOK_COMMAND: "alacran-outlook",
  ensureOutlookLauncher: async () => "unchanged",
  readOutlookStatus: async () => ({ connected: false }),
}))


const claude = AI_EXECUTORS["claude-code"]
const resolveClaude = async () => claude
const found = async () => true
const missing = async () => false

/** A repo whose summary is current: `git log` and the file's own frontmatter
 *  name the same commit. */
const freshRepo = {
  exec: async () => ({ stdout: "abc123\n", stderr: "" }),
  read: async () => `---\nsource_commit: abc123\n---\nAcme sells widgets.`,
}

describe("buildAssistantLaunch", () => {
  it("starts the company's executor with the Get Started briefing as its first message", async () => {
    const result = await buildAssistantLaunch("acme", "/companies/acme", resolveClaude, found, freshRepo.exec, freshRepo.read)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.launch.file).toBe("claude")
    // One positional argument: the prompt. Nothing shell-quoted, because
    // nothing goes through a shell.
    expect(result.launch.args).toHaveLength(1)
    expect(result.launch.args[0]).toContain(COMPANY_SUMMARY_PATH)
    expect(result.label).toBe("Claude Code")
  })

  it("asks the assistant to re-read everything when the summary is out of date", async () => {
    const stale = await buildAssistantLaunch(
      "acme",
      "/companies/acme",
      resolveClaude,
      found,
      async () => ({ stdout: "newsha\n", stderr: "" }),
      async () => `---\nsource_commit: oldsha\n---\n`
    )

    expect(stale.ok).toBe(true)
    if (!stale.ok) return
    expect(stale.launch.args[0]).toContain(".claude/skills")
    expect(stale.launch.args[0]).toContain("newsha")
  })

  it("refuses with something the user can act on when the executor isn't installed", async () => {
    const result = await buildAssistantLaunch("acme", "/companies/acme", resolveClaude, missing, freshRepo.exec, freshRepo.read)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("Claude Code")
    expect(result.message).toContain("Connectors")
  })

  it("opens an executor that cannot be seeded blank, never with an invented flag", async () => {
    // The absence of buildInteractiveIntroArgs is a supported state per
    // ai-executors.ts: the tab starts the CLI with no arguments at all.
    const unseedable: AiExecutor = { ...claude, buildInteractiveIntroArgs: undefined }
    const result = await buildAssistantLaunch(
      "acme",
      "/companies/acme",
      async () => unseedable,
      found,
      freshRepo.exec,
      freshRepo.read
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.launch).toEqual({ file: unseedable.binaryName, args: [] })
  })
})

describe("buildAssistantLaunch, second tab onwards", () => {
  it("skips the whole introduction when an assistant for this executor is already open", async () => {
    const result = await buildAssistantLaunch(
      "acme",
      "/companies/acme",
      resolveClaude,
      found,
      freshRepo.exec,
      freshRepo.read,
      () => true
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Asserted as an EQUALITY, not as two absences: absences alone also pass
    // for an empty prompt, which is exactly the "Claude auto-loads, so it needs
    // no instruction" simplification that would silently restore the greeting.
    expect(result.launch.args).toEqual([buildReturningAssistantPrompt(true)])
    // Claude Code loads AGENTS.md on its own, so a returning tab reads nothing.
    expect(result.launch.args.join(" ")).not.toContain(COMPANY_SUMMARY_PATH)
    expect(result.launch.args.join(" ")).not.toContain("notes/company/sessions/")
  })

  it("asks about THIS executor, so a company mid-switch still gets one introduction", async () => {
    const asked: Array<[string, string]> = []
    const result = await buildAssistantLaunch(
      "acme",
      "/companies/acme",
      resolveClaude,
      found,
      freshRepo.exec,
      freshRepo.read,
      (agentId, executorId) => {
        asked.push([agentId, executorId])
        return false
      }
    )

    expect(asked).toEqual([["acme", "claude-code"]])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.launch.args.join(" ")).toContain(COMPANY_SUMMARY_PATH)
  })

  it("still hands a returning tab the summary when its executor reads nothing on its own", async () => {
    // Kiro has no autoLoadsCompanyContext, so "read nothing" would be an agent
    // standing in the company folder knowing nothing about the company.
    const result = await buildAssistantLaunch(
      "acme",
      "/companies/acme",
      async () => AI_EXECUTORS.kiro,
      found,
      freshRepo.exec,
      freshRepo.read,
      () => true
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.launch.args).toEqual(["chat", buildReturningAssistantPrompt(false)])
    expect(result.launch.args.join(" ")).toContain(COMPANY_SUMMARY_PATH)
    expect(result.launch.args.join(" ")).not.toContain("notes/company/sessions/")
  })

  it("reports which executor it started, so the session can be recorded under it", async () => {
    const result = await buildAssistantLaunch(
      "acme",
      "/companies/acme",
      resolveClaude,
      found,
      freshRepo.exec,
      freshRepo.read
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.executorId).toBe("claude-code")
  })
})

describe("buildAssistantLaunch, a returning tab on a stale summary", () => {
  it("regenerates rather than skipping, because no other path rewrites that file", async () => {
    const result = await buildAssistantLaunch(
      "acme",
      "/companies/acme",
      resolveClaude,
      found,
      async () => ({ stdout: "newsha\n", stderr: "" }),
      async () => `---\nsource_commit: oldsha\n---\n`,
      () => true
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.launch.args[0]).toContain(".claude/skills")
    expect(result.launch.args[0]).toContain("newsha")
  })
})

describe("buildAssistantLaunch — knowledge other companies share", () => {
  const never = () => false

  it("hands the assistant what other companies share, after its briefing", async () => {
    const result = await buildAssistantLaunch(
      "acme", "/companies/acme", resolveClaude, found, freshRepo.exec, freshRepo.read, never,
      async () => "## Knowledge other companies share with Acme\nBeta sells anvils."
    )
    if (!result.ok) throw new Error("expected a launch")
    expect(result.launch.args).toHaveLength(1)
    expect(result.launch.args[0]).toContain(COMPANY_SUMMARY_PATH)
    expect(result.launch.args[0]).toContain("Beta sells anvils.")
  })

  it("leaves the briefing untouched when nothing is shared with the company", async () => {
    const plain = await buildAssistantLaunch("acme", "/companies/acme", resolveClaude, found, freshRepo.exec, freshRepo.read, never, async () => "")
    const baseline = await buildAssistantLaunch("acme", "/companies/acme", resolveClaude, found, freshRepo.exec, freshRepo.read, never, async () => "")
    if (!plain.ok || !baseline.ok) throw new Error("expected a launch")
    expect(plain.launch.args).toEqual(baseline.launch.args)
    expect(plain.launch.args[0]).not.toContain("Knowledge other companies share")
  })
})


describe("buildAssistantLaunch — tools connected on this computer", () => {
  const never = () => false
  const noShared = async () => ""

  it("tells the assistant about a connected tool, after its briefing", async () => {
    const result = await buildAssistantLaunch(
      "acme", "/companies/acme", resolveClaude, found, freshRepo.exec, freshRepo.read, never, noShared,
      async () => "## Connected tools\nOutlook is connected on this computer."
    )
    if (!result.ok) throw new Error("expected a launch")
    expect(result.launch.args[0]).toContain(COMPANY_SUMMARY_PATH)
    expect(result.launch.args[0]).toContain("Outlook is connected on this computer.")
    expect(result.launch.args[0].indexOf(COMPANY_SUMMARY_PATH)).toBeLessThan(result.launch.args[0].indexOf("Outlook is connected"))
  })

  it("leaves the briefing untouched when nothing is connected", async () => {
    const plain = await buildAssistantLaunch("acme", "/companies/acme", resolveClaude, found, freshRepo.exec, freshRepo.read, never, noShared, async () => "")
    const baseline = await buildAssistantLaunch("acme", "/companies/acme", resolveClaude, found, freshRepo.exec, freshRepo.read, never, noShared, async () => "")
    if (!plain.ok || !baseline.ok) throw new Error("expected a launch")
    expect(plain.launch.args).toEqual(baseline.launch.args)
    expect(plain.launch.args[0]).not.toContain("Connected tools")
  })
})
