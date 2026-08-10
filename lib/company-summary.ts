import path from "node:path"
import type { ExecFileFn } from "./terminal-launch-command"

/**
 * The "Get Started" cache: instead of re-reading every skill file and the
 * ontology on every click, the agent writes down what it found here once,
 * and future clicks reuse it — until something it was derived from actually
 * changes. Portable core, like docs/decisions/ and HANDOFF.md, not a
 * `.claude/*`-specific artifact, even though what it summarizes lives partly
 * under `.claude/`.
 */
export const COMPANY_SUMMARY_PATH = "docs/company-summary.md"

// Whatever the summary is actually derived from. If none of these have
// changed since the summary's own source_commit, it's still accurate.
export const WATCHED_PATHS = [".claude/skills", ".claude/commands", "definitions/ontology/company.yaml"]

/**
 * The latest commit SHA touching any watched path, or null if that can't be
 * determined (no git, no commits touching those paths yet, fresh repo). A
 * missing answer is treated as "can't prove this is fresh" by the caller,
 * not as "fresh" — the safe default is to regenerate, not to trust a stale
 * summary silently.
 */
export async function latestWatchedCommit(rootPath: string, execFn: ExecFileFn): Promise<string | null> {
  try {
    const { stdout } = await execFn("git", ["-C", rootPath, "log", "-1", "--format=%H", "--", ...WATCHED_PATHS])
    const sha = stdout.trim()
    return sha.length > 0 ? sha : null
  } catch {
    return null
  }
}

function extractSourceCommit(content: string): string | null {
  const match = /^source_commit:\s*(\S+)\s*$/m.exec(content)
  return match ? match[1] : null
}

const FRESH_PROMPT = `Read ${COMPANY_SUMMARY_PATH} and introduce yourself based on it, in plain language: summarize what this company is set up to do and what you can actually help me run, then ask me what I'd like to start with. It's already up to date — don't re-read the underlying skill or ontology files.`

function buildStalePrompt(sourceCommit: string | null): string {
  const sourceCommitValue = sourceCommit ?? "none"
  return `Read this company's definitions/ontology/company.yaml (if it exists) and every skill or command file under .claude/skills/ and .claude/commands/.

Then write ${COMPANY_SUMMARY_PATH}. If it already exists, keep its "created" date and only update "updated" and "source_commit"; otherwise use today's date for both. Frontmatter:

---
type: company-summary
status: active
created: <today, or the existing created: date>
updated: <today>
source_commit: ${sourceCommitValue}
tags: []
---

Followed by a plain-language summary: 2-3 sentences on what this company is set up to do, then a list of what you can actually help with based on what's really installed here (not a generic list).

After writing the file, introduce yourself in plain language using that same summary, without any jargon, and ask me what I'd like to start with.`
}

/**
 * Decides whether the cached summary is still trustworthy (a plain
 * `git log` comparison, no AI call — the entire point is to only pay real
 * agent-read-everything tokens when something has actually changed), and
 * returns the right seeded first message for either case.
 */
export async function buildGetStartedIntroPrompt(
  rootPath: string,
  execFn: ExecFileFn,
  readFileFn: (path: string) => Promise<string>
): Promise<string> {
  const currentCommit = await latestWatchedCommit(rootPath, execFn)

  let storedCommit: string | null = null
  try {
    const content = await readFileFn(path.join(rootPath, COMPANY_SUMMARY_PATH))
    storedCommit = extractSourceCommit(content)
  } catch {
    storedCommit = null
  }

  const fresh = currentCommit !== null && storedCommit !== null && currentCommit === storedCommit
  return fresh ? FRESH_PROMPT : buildStalePrompt(currentCommit)
}
