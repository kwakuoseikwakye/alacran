import type { AiExecutorId } from "@/lib/ai-executors"

/**
 * How the operating guide (a block in a company's AGENTS.md) reaches each AI, from the vendors' own
 * documentation as read on 2026-10-04, plus what a real run showed. The two are kept apart on purpose:
 * `agreement` and `skillFolders` are DOCUMENTED; `behaviour` is MEASURED and stays "unverified" until a
 * committed report under docs/guide-coverage/ says otherwise.
 *
 * A total Record: a sixth AI cannot be added without answering the question.
 */
export type Agreement =
  /** Loaded through CLAUDE.md's @AGENTS.md import (every Alacrán company has one). */
  | "claude-import"
  /** The CLI reads a project AGENTS.md by itself. */
  | "reads-agents-md"
  /** Only the app's opening message points it at AGENTS.md. */
  | "primer-only"
  | "unknown"

export type Verdict = "follows" | "partial" | "does-not" | "unverified"

export type ExecutorCoverage = {
  agreement: Agreement
  /** Project folders the CLI scans for skills, per its docs. */
  skillFolders: string[]
  /** Whether AGENTS.md is loaded in print (-p) runs: stated in the docs, shown by a run, or not known. */
  printModeLoadsAgreement: "documented" | "measured" | "unknown"
  sources: { url: string; readOn: string }[]
  behaviour: { verdict: Verdict; cliVersion: string | null; measuredOn: string | null; evidence: string | null }
}

const UNVERIFIED = { verdict: "unverified", cliVersion: null, measuredOn: null, evidence: null } as const
const READ = "2026-10-04"

export const EXECUTOR_COVERAGE: Record<AiExecutorId, ExecutorCoverage> = {
  "claude-code": {
    agreement: "claude-import",
    skillFolders: [".claude/skills", ".claude/commands"],
    printModeLoadsAgreement: "documented",
    sources: [{ url: "https://code.claude.com/docs/en/memory", readOn: READ }],
    behaviour: { verdict: "does-not", cliVersion: "2.1.289 (Claude Code)", measuredOn: "2026-10-04", evidence: "docs/guide-coverage/2026-10-04-report.md" } as const,
  },
  codex: {
    agreement: "reads-agents-md",
    skillFolders: [".agents/skills"],
    printModeLoadsAgreement: "measured",
    sources: [
      { url: "https://learn.chatgpt.com/docs/agent-configuration/agents-md", readOn: READ },
      { url: "https://learn.chatgpt.com/docs/build-skills", readOn: READ },
    ],
    behaviour: { verdict: "follows", cliVersion: "codex-cli 0.160.0", measuredOn: "2026-10-04", evidence: "docs/guide-coverage/2026-10-04-report.md" } as const,
  },
  kimi: {
    agreement: "reads-agents-md",
    skillFolders: [".kimi-code/skills", ".agents/skills"],
    printModeLoadsAgreement: "unknown",
    sources: [
      { url: "https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents.html", readOn: READ },
      { url: "https://www.kimi.com/code/docs/en/kimi-code-cli/customization/skills.html", readOn: READ },
    ],
    behaviour: UNVERIFIED,
  },
  kiro: {
    agreement: "reads-agents-md",
    skillFolders: [".kiro/skills"],
    printModeLoadsAgreement: "unknown",
    sources: [
      { url: "https://kiro.dev/docs/steering/", readOn: READ },
      { url: "https://kiro.dev/docs/skills/", readOn: READ },
    ],
    behaviour: { verdict: "partial", cliVersion: "kiro-cli 2.25.0", measuredOn: "2026-10-04", evidence: "docs/guide-coverage/2026-10-04-report.md" } as const,
  },
  "google-antigravity": {
    agreement: "reads-agents-md",
    skillFolders: [".agents/skills"],
    printModeLoadsAgreement: "unknown",
    sources: [
      { url: "https://antigravity.google/docs/rules/", readOn: READ },
      { url: "https://antigravity.google/docs/skills/", readOn: READ },
    ],
    behaviour: UNVERIFIED,
  },
}
