import { describe, it, expect } from "vitest"
import {
  latestWatchedCommit,
  buildGetStartedIntroPrompt,
  buildCompanyContextPrimer,
  buildReturningAssistantPrompt,
  COMPANY_SUMMARY_PATH,
  WATCHED_PATHS,
} from "./company-summary"
import { AGENTS_FILE } from "./portable-agent-file"
import type { ExecFileFn } from "./terminal-launch-command"

describe("buildCompanyContextPrimer", () => {
  const PRIMER = buildCompanyContextPrimer("- digest (command) — Summarise notes")

  /**
   * The drift this exists to prevent: WATCHED_PATHS gains an entry (a new
   * folder the app writes company knowledge into), every seeding path picks it
   * up, and the primer alone keeps naming the old set — so the executors that
   * need telling are the only ones that never hear about it. Building the
   * prose from the array makes that impossible; this proves the build.
   */
  it("names every path this app considers company knowledge", () => {
    for (const watched of WATCHED_PATHS) {
      expect(PRIMER).toContain(watched)
    }
  })

  it("names the executor-neutral working agreement, not one vendor's filename", () => {
    expect(PRIMER).toContain(AGENTS_FILE)
    expect(PRIMER).not.toContain("CLAUDE.md")
  })

  it("opens read-only — a session the user opened to work in must not start by editing", () => {
    expect(PRIMER).toMatch(/don't change any files/i)
  })

  /**
   * The cost fix. Naming the two directories is fine and required above; what
   * must never come back is telling the agent to OPEN what is in them, which
   * on a company carrying one skill pack is ~500KB before it has said hello.
   */
  it("hands over the inventory instead of asking the agent to read every file", () => {
    expect(PRIMER).toContain("- digest (command) — Summarise notes")
    expect(PRIMER).toMatch(/never read them all/i)
    expect(PRIMER).not.toMatch(/every skill or command file/i)
  })

  it("names the shared skills folder and watches it for a stale summary", () => {
    expect(PRIMER).toContain(".agents/skills/")
    expect(WATCHED_PATHS).toContain(".agents/skills")
    expect(PRIMER).not.toContain("That folder is named after one vendor")
  })

  it("tells this agent how to run a command, and Codex that it has no custom slash commands", () => {
    const codex = buildCompanyContextPrimer("- verify (skill) — Runs the checks.", "codex")
    expect(codex).toContain("In Codex, run one by writing its name after a dollar sign")
    expect(buildCompanyContextPrimer("- verify (skill)", "kimi")).toContain("Run one by typing /skill:name.")
    // Without knowing the agent it still works, and promises no invocation.
    expect(PRIMER).not.toMatch(/Run one by typing/)
  })
})

describe("latestWatchedCommit", () => {
  it("asks git for the latest commit touching exactly the watched paths, scoped to the repo", async () => {
    const calls: { command: string; args: string[] }[] = []
    const execFn: ExecFileFn = async (command, args) => {
      calls.push({ command, args })
      return { stdout: "abc123\n", stderr: "" }
    }
    const sha = await latestWatchedCommit("/companies/acme", execFn)
    expect(sha).toBe("abc123")
    expect(calls).toEqual([
      { command: "git", args: ["-C", "/companies/acme", "log", "-1", "--format=%H", "--", ...WATCHED_PATHS] },
    ])
  })

  it("returns null when git has no commits touching those paths (empty stdout)", async () => {
    const execFn: ExecFileFn = async () => ({ stdout: "", stderr: "" })
    expect(await latestWatchedCommit("/companies/acme", execFn)).toBeNull()
  })

  it("returns null rather than throwing when git itself fails (no repo, no git installed)", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("not a git repository")
    }
    expect(await latestWatchedCommit("/companies/acme", execFn)).toBeNull()
  })
})

describe("buildGetStartedIntroPrompt", () => {
  const INVENTORY = "- digest (command) — Summarise notes"
  const execFnReturning = (sha: string): ExecFileFn => async () => ({ stdout: `${sha}\n`, stderr: "" })

  it("fresh: current commit matches the summary's stored source_commit — tells the agent to just read the summary", async () => {
    const execFn = execFnReturning("abc123")
    const readFileFn = async (path: string) => {
      expect(path).toContain(COMPANY_SUMMARY_PATH)
      return "---\ntype: company-summary\nsource_commit: abc123\n---\n\nSummary here.\n"
    }
    const prompt = await buildGetStartedIntroPrompt("/companies/acme", execFn, readFileFn, async () => INVENTORY)
    expect(prompt).toContain(`Read ${COMPANY_SUMMARY_PATH}`)
    expect(prompt).toContain("up to date")
    expect(prompt).not.toContain(".claude/skills/")
  })

  it("fresh: never even scans the company's skills — that path reads one file and must stay the cheap one", async () => {
    let scanned = false
    const prompt = await buildGetStartedIntroPrompt(
      "/companies/acme",
      execFnReturning("abc123"),
      async () => "---\nsource_commit: abc123\n---\n",
      async () => {
        scanned = true
        return INVENTORY
      }
    )
    expect(scanned).toBe(false)
    expect(prompt).not.toContain(INVENTORY)
  })

  it("returning + stale: regenerates anyway, because this is the only path that rewrites the summary", async () => {
    // The returning prompt must never win over a stale summary. The in-app
    // terminal auto-opens one assistant tab whose pty outlives the page, so if
    // "a tab is live" could suppress the stale branch, a company that installed
    // a skill pack would keep describing itself from the old summary all day.
    const prompt = await buildGetStartedIntroPrompt(
      "/companies/acme",
      execFnReturning("newsha456"),
      async () => "---\nsource_commit: oldsha123\n---\n",
      async () => INVENTORY,
      { autoLoadsCompanyContext: true }
    )

    expect(prompt).toContain(`write ${COMPANY_SUMMARY_PATH}`)
    expect(prompt).toContain("source_commit: newsha456")
  })

  it("returning + fresh: the short prompt, and nothing else", async () => {
    const prompt = await buildGetStartedIntroPrompt(
      "/companies/acme",
      execFnReturning("abc123"),
      async () => "---\nsource_commit: abc123\n---\n",
      async () => INVENTORY,
      { autoLoadsCompanyContext: true }
    )

    expect(prompt).toBe(buildReturningAssistantPrompt(true))
  })

  it("returning + fresh: passes the executor's own auto-load answer through", async () => {
    const prompt = await buildGetStartedIntroPrompt(
      "/companies/acme",
      execFnReturning("abc123"),
      async () => "---\nsource_commit: abc123\n---\n",
      async () => INVENTORY,
      { autoLoadsCompanyContext: false }
    )

    expect(prompt).toBe(buildReturningAssistantPrompt(false))
  })

  it("stale: current commit differs from the stored source_commit — tells the agent to regenerate", async () => {
    const execFn = execFnReturning("newsha456")
    const readFileFn = async () => "---\nsource_commit: oldsha123\n---\n\nStale summary.\n"
    const prompt = await buildGetStartedIntroPrompt("/companies/acme", execFn, readFileFn, async () => INVENTORY)
    expect(prompt).toContain(".claude/skills/")
    expect(prompt).toContain(`write ${COMPANY_SUMMARY_PATH}`)
    expect(prompt).toContain("source_commit: newsha456")
    // The list, not an instruction to open every file behind it.
    expect(prompt).toContain(INVENTORY)
    expect(prompt).toMatch(/do not read those files/i)
  })

  it("missing summary file: treated as stale, embeds the real current commit for the agent to write", async () => {
    const execFn = execFnReturning("abc123")
    const readFileFn = async () => {
      throw new Error("ENOENT")
    }
    const prompt = await buildGetStartedIntroPrompt("/companies/acme", execFn, readFileFn, async () => INVENTORY)
    expect(prompt).toContain(".claude/skills/")
    expect(prompt).toContain("source_commit: abc123")
  })

  it("git can't determine a commit at all: still safely falls back to the stale/regenerate path", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("no git")
    }
    const readFileFn = async () => "---\nsource_commit: whatever\n---\n"
    const prompt = await buildGetStartedIntroPrompt("/companies/acme", execFn, readFileFn, async () => INVENTORY)
    expect(prompt).toContain(".claude/skills/")
    expect(prompt).toContain("source_commit: none")
  })
})

describe("buildReturningAssistantPrompt", () => {
  it("reads nothing at all for an executor that finds the company's files by itself", () => {
    const prompt = buildReturningAssistantPrompt(true)

    expect(prompt).not.toContain(COMPANY_SUMMARY_PATH)
    expect(prompt).not.toContain("notes/company/sessions/")
    expect(prompt).not.toContain("beeper")
  })

  it("points an executor that finds nothing at the summary, and at nothing else", () => {
    const prompt = buildReturningAssistantPrompt(false)

    // The one already-written file, never the inventory the stale path reads.
    expect(prompt).toContain(COMPANY_SUMMARY_PATH)
    expect(prompt).not.toContain(".claude/skills")
    expect(prompt).not.toContain("notes/company/sessions/")
    expect(prompt).not.toContain("beeper")
  })

  it("scopes the read restriction to now, instead of banning every later read", () => {
    // "that one file and nothing else" carried no time bound, on the branch that
    // exists precisely for CLIs that follow instructions literally — so the
    // first request ("what's still open in HANDOFF.md?") read as forbidden.
    // Every sibling prompt scopes its restriction: FRESH_PROMPT to re-reading,
    // the primer to "what I ask next", the write ban to "yet".
    expect(buildReturningAssistantPrompt(false)).toMatch(/for now/i)
  })

  it("tolerates a summary that isn't written yet, which is every brand-new company", () => {
    // The first tab is what WRITES the summary. A second tab opened while that
    // is still running — or after it was closed early — points at a file that
    // does not exist, and an executor following the instruction literally must
    // not stall or invent one. Same "skip it if it isn't there" wording
    // buildCompanyContextPrimer already uses.
    expect(buildReturningAssistantPrompt(false)).toMatch(/if it (exists|isn't there)|skip it/i)
  })

  it("forbids the introduction rather than merely mentioning one", () => {
    // /introduc/i matched "Don't introduce yourself" and "Introduce yourself"
    // equally, so it passed against a prompt rewritten to the literal inverse
    // of this feature. Pin the negation itself.
    for (const prompt of [buildReturningAssistantPrompt(true), buildReturningAssistantPrompt(false)]) {
      expect(prompt).toMatch(/don'?t introduce yourself/i)
      expect(prompt).toMatch(/don'?t (summarise|summarize) what this company does/i)
      expect(prompt).toMatch(/don'?t recap the last session/i)
      expect(prompt).not.toMatch(/(^|[^t] )introduce yourself/i)
    }
  })
})
