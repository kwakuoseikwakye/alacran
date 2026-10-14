import path from "node:path"
import { AGENTS_FILE } from "./portable-agent-file"
import { readCompanyInventory } from "./skills/company-inventory"
import { invocationSentence } from "./skills/invocation"
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
export const WATCHED_PATHS = [
  ".agents/skills",
  ".claude/skills",
  ".claude/commands",
  ".kiro/skills",
  "definitions/ontology/company.yaml",
]

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

/**
 * The opening message for an executor that does NOT find this company's files
 * by itself — see `autoLoadsCompanyContext` in ai-executors.ts.
 *
 * Claude Code reads `CLAUDE.md` (which points at `AGENTS.md`, v86) and
 * discovers `.claude/commands` and `.claude/skills` the moment a session
 * starts in the company folder, so "just run the executor here" already
 * arrives knowing the business. Every other CLI discovers its own vendor
 * folder and nothing else, so the identical click opened a session that knew
 * nothing about the company it was standing in.
 *
 * This is a PARITY fix, not a new feature: the same context Claude Code loads
 * silently, asked for out loud because the other tool will not go looking. The
 * knowledge in `.claude/commands/*.md` was never Claude-specific — they are
 * plain markdown instructions, and the folder name is one adapter over a
 * portable core (v17). Only the `/name` shorthand is a vendor feature.
 *
 * It still names every path in WATCHED_PATHS — that array is this app's answer
 * to "what is this company's knowledge", and a primer naming a different set is
 * exactly the two-lists drift v72's marks and v86's stamps each paid a slice to
 * remove. What changed is what it asks for: the two directories arrive as an
 * already-read list of names and descriptions rather than as an instruction to
 * open every file in them, which on a company carrying one skill pack was half
 * a megabyte before the agent had said hello. See skills/company-inventory.ts.
 */
export function buildCompanyContextPrimer(inventory: string, executorId?: string): string {
  return `Before we start, read this company's own files so you know what it is — ${AGENTS_FILE} (the working agreement), then definitions/ontology/company.yaml. Skip either one if it doesn't exist.

Everything installed under .agents/skills/, .claude/skills/, .claude/commands/ and .kiro/skills/ is listed below, with each entry's own name and description. That list is complete: open one of those files only if you genuinely need its detail for what I ask next, and never read them all.

${inventory}

Those folders hold plain markdown instructions any agent can follow, and the same command can appear in more than one of them. Treat every entry as a job you can carry out.${executorId ? ` ${invocationSentence(executorId)}` : ""}

Then tell me in one or two plain sentences what this company does and what you can help me run, and wait for my first request. Don't change any files yet.`
}

/**
 * Get Started reads the company's own files and says what it can help with —
 * and a user who has just connected every chat network they own reasonably
 * expects "catch me up" to be on that list. It was not: the seeded prompt
 * never mentioned chat, so the agent introduced itself off the summary and
 * stopped, which is exactly what it was asked to do.
 *
 * OFFERED, never read unprompted. Opening a session should not silently pull
 * a day of someone's private WhatsApp and iMessage into a transcript, and the
 * read costs a real second before the introduction appears. `AGENTS.md` §7 is
 * where the how lives (including `--read-only` and treating what it finds as
 * a claim); this only has to make the capability discoverable at the one
 * moment the user is asking "what can you do".
 */
/**
 * "Save what we learned" wrote session notes into notes/company/sessions/ and
 * **nothing ever read them back** — the folder was write-only. So a user who
 * ended one terminal session by saving it, and opened the next one the same
 * day, was met by an assistant that had read the company's files and had no
 * idea they had ever spoken. Reported exactly that way.
 *
 * The most recent note only. A session note is already a summary, the folder
 * grows one file per session forever, and "where we left off" is a question
 * about the last one — reading the whole folder would cost more and say less.
 */
const LAST_SESSION =
  " Then check notes/company/sessions/ and read the single most recent file there, if the folder exists " +
  "and has any. If you find one, open by reminding me in a line or two where we left off and what was " +
  "still open from it, before you ask what I'd like to do next. If there is none, skip this silently — " +
  "a first session is not worth remarking on."

const CHAT_OFFER =
  " If the `beeper` command is available on this machine (check with `command -v beeper`; plenty of " +
  "companies won't have it, which is fine and not worth mentioning if so), add one line to your " +
  "introduction offering to catch me up on what's been said across my chats recently, or to search " +
  "them for something specific. Offer it — do not read any messages unless I say yes."

const FRESH_PROMPT = `Read ${COMPANY_SUMMARY_PATH} and introduce yourself based on it, in plain language: summarize what this company is set up to do and what you can actually help me run, then ask me what I'd like to start with. It's already up to date — don't re-read the underlying skill or ontology files.` + LAST_SESSION + CHAT_OFFER

/**
 * The opening message for the SECOND assistant tab onwards in one company,
 * for one executor.
 *
 * The full intro does four jobs at once — load the company's context, say
 * hello out loud, recap the last session, offer the chat sweep. Only the
 * first is owed to every tab. The other three are welcome behaviour, and a
 * user who opens a second assistant to get work done has already been
 * welcomed: they were made to sit through the same paragraph, the same
 * "where we left off", and the same Beeper offer before they could type.
 * Three identical greetings in three tabs also reads as an app that is not
 * tracking its own state, which is a poor look for one whose whole pitch is
 * permanent memory.
 *
 * Whether it may read NOTHING turns on `autoLoadsCompanyContext`, the field
 * that already models this difference (see ai-executors.ts). Claude Code
 * finds CLAUDE.md -> AGENTS.md by itself, so a returning tab is told to read
 * nothing at all. Every other executor goes looking for its own vendor folder
 * and finds no company, so "read nothing" would be an agent standing in the
 * company folder with no idea whose it is — the exact blindness
 * `buildCompanyContextPrimer` exists to fix. It gets the one already-written
 * summary file, never the skill inventory the stale path reads.
 *
 * The summary it names is guaranteed to exist and be current: this prompt is
 * only ever chosen on `buildGetStartedIntroPrompt`'s fresh branch. The "skip it
 * if it isn't there" clause is belt-and-braces for an executor following the
 * instruction literally, not the thing that makes the missing-file case safe.
 *
 * Deliberately NOT here, on either branch: the session-note recap. A second
 * tab is a parallel task in the same sitting, and the most recent note
 * describes the PREVIOUS session — not what the first tab is doing right now,
 * which is what a user opening a second tab actually wants to know about and
 * which no file can tell it.
 */
export function buildReturningAssistantPrompt(autoLoadsCompanyContext: boolean): string {
  const opening =
    "Another assistant is already open for this company, so the introduction has been done. " +
    "Don't introduce yourself, don't summarise what this company does, and don't recap the last session."

  const context = autoLoadsCompanyContext
    ? " You already have this company's own files."
    : ` Read ${COMPANY_SUMMARY_PATH} quietly so you know what this company is — for now that one file and nothing else, and skip it if it isn't there. Once I've asked for something, read whatever that needs.`

  return `${opening}${context} Reply with one short line saying you're ready, then wait for my first request. Don't change any files yet.`
}

function buildStalePrompt(sourceCommit: string | null, inventory: string): string {
  const sourceCommitValue = sourceCommit ?? "none"
  return `Read this company's definitions/ontology/company.yaml (if it exists).

Everything installed under .agents/skills/, .claude/skills/, .claude/commands/ and .kiro/skills/ is listed below, with each entry's own name and description, read straight from their frontmatter. That list is complete and is what this summary should be built from — do not read those files.

${inventory}

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

After writing the file, introduce yourself in plain language using that same summary, without any jargon, and ask me what I'd like to start with.` + LAST_SESSION + CHAT_OFFER
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
  readFileFn: (path: string) => Promise<string>,
  inventoryFn: (rootPath: string) => Promise<string> = readCompanyInventory,
  /** Set when this is the second tab onwards for one (company, executor) pair.
   *  It can only replace the FRESH prompt — see below. */
  returning?: { autoLoadsCompanyContext: boolean }
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

  // A returning tab may replace the FRESH prompt and nothing else. The stale
  // branch is the only thing in the app that rewrites docs/company-summary.md,
  // and the in-app terminal auto-opens an assistant whose pty outlives the
  // page — so letting "a tab is already live" suppress it would freeze that
  // file for the whole app session. A company that installed a skill pack at
  // 10am would describe itself from the old summary until every assistant tab
  // was closed, and `ask-company-impl.ts` and `assistant/gather-all-companies.ts`
  // read the same file. Staleness outranks the greeting.
  //
  // It also means the returning prompt can only ever point at a summary this
  // function has just proved current: `fresh` requires the file to be readable
  // AND its source_commit to match, so the missing-file and half-written cases
  // both land on the stale branch that fixes them.
  if (fresh) return returning ? buildReturningAssistantPrompt(returning.autoLoadsCompanyContext) : FRESH_PROMPT

  // The inventory is only read on the path that uses it — the fresh prompt
  // reads one already-written file and must stay the cheap one.
  return buildStalePrompt(currentCommit, await inventoryFn(rootPath))
}
