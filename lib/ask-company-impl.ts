import { execFile as nodeExecFile } from "node:child_process"
import { resolveAiExecutorForAgent } from "./ai-executor-registry"
import { getEffectiveAgents } from "./get-effective-agents"
import { asEnvelopeResult, voiceEnvelopeInstruction } from "./assistant/voice-envelope"
import { cleanAssistantStderr, explainAssistantFailure } from "./assistant/clean-stderr"
import { buildPersonaBlock, type AssistantPersona } from "./assistant/persona"
import { readPersonaForCompany } from "./assistant/resolve-persona"
import { getAiExecutor, AI_EXECUTORS, type AiExecutor, type AiExecutorId } from "./ai-executors"

export type ExecFileFn = (
  command: string,
  args: string[],
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cp = nodeExecFile(
      command,
      args,
      { ...options, timeout: 2 * 60_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout: stdout ?? "", stderr: stderr ?? "" }))
        } else {
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "" })
        }
      }
    )
    cp.stdin?.end()
  })
}

export type ResolveExecutorFn = (agentId: string) => Promise<AiExecutor>
export type ResolveAgentRootFn = (agentId: string) => Promise<string | undefined>
export type ReadPersonaFn = (agentRootPath: string | null) => Promise<AssistantPersona | null>

async function defaultResolveAgentRoot(agentId: string): Promise<string | undefined> {
  const agents = await getEffectiveAgents()
  return agents.find((a) => a.id === agentId)?.rootPath
}

import path from "node:path"
import { readFile, readdir } from "node:fs/promises"
import yaml from "yaml"
import { mkdir } from "node:fs/promises"
import { dataPath } from "./data-dir"
import { departmentLabels, distillCompanySummary } from "./assistant/gather-all-companies"
import { answerLocally, localAnswerDepsFor } from "./assistant/local-answer"
import { sharedKnowledgeFor } from "./sharing/shared-for-company"

export type ReadFileFn = (path: string, encoding: "utf-8") => Promise<string>
export type ReadDirFn = (dirPath: string) => Promise<string[]>

const defaultReadFile: ReadFileFn = (p) => readFile(p, "utf-8")
const defaultReadDir: ReadDirFn = async (p) => {
  try {
    return await readdir(p)
  } catch {
    return []
  }
}

/**
 * The memory every question carries, under a fixed budget.
 *
 * Pre-read in Node so a single-company question answers in one fast turn. It
 * used to paste whole files — this repo's HANDOFF.md alone is ~104 KB, ~26k
 * tokens, on every question, growing forever. Each tier is now capped and the
 * total is held to MEMORY_BUDGET_CHARS, highest-value first:
 *   1. the company card (summary or company file, with a staleness note)
 *   2. what happened recently (the latest HANDOFF entry, the newest session note)
 *   3. notes that match this question (local keyword search — no tokens spent)
 *   4. live numbers, then recent decision/retro excerpts
 * Anything else stays on disk; the agent can still read a file if it must.
 */
export const MEMORY_BUDGET_CHARS = 12_000

export async function gatherSingleCompanyContext(
  rootPath: string,
  readFileFn: ReadFileFn = defaultReadFile,
  readDirFn: ReadDirFn = defaultReadDir,
  options: { question?: string; now?: Date } = {}
): Promise<string> {
  const tiers: Array<{ priority: number; text: string }> = []
  const sections = { push: (text: string) => tiers.push({ priority: 4, text }) }
  const add = (priority: number, text: string) => tiers.push({ priority, text })
  const now = options.now ?? new Date()
  const alreadyIncluded = new Set<string>()

  // 1. Company card: summary, else the company file — with how old it is.
  try {
    const summary = await readFileFn(path.join(rootPath, "docs/company-summary.md"), "utf-8")
    if (summary.trim()) {
      add(1, `## docs/company-summary.md\n${distillCompanySummary(summary)}${stalenessNote(summary, now)}`)
    }
  } catch {
    try {
      const ontology = await readFileFn(path.join(rootPath, "definitions/ontology/company.yaml"), "utf-8")
      if (ontology.trim()) {
        add(1, `## definitions/ontology/company.yaml\n${capText(ontology.trim(), 2_500)}${stalenessNote(ontology, now)}`)
      }
    } catch {
      /* ignore */
    }
  }

  // 2. What happened recently: the latest HANDOFF entry, not the whole log.
  try {
    const handoff = await readFileFn(path.join(rootPath, "HANDOFF.md"), "utf-8")
    if (handoff.trim()) add(2, `## HANDOFF.md (latest entry)\n${latestHandoffEntry(handoff)}`)
  } catch {
    /* ignore */
  }

  try {
    const sessions = await readDirFn(path.join(rootPath, "notes/company/sessions"))
    const mdFiles = sessions.filter((f) => f.endsWith(".md")).sort().reverse()
    if (mdFiles.length > 0) {
      const note = await readFileFn(path.join(rootPath, "notes/company/sessions", mdFiles[0]), "utf-8")
      if (note.trim()) {
        add(2, `## notes/company/sessions/${mdFiles[0]}\n${capText(note.trim(), 1_500)}`)
        alreadyIncluded.add(`notes/company/sessions/${mdFiles[0]}`)
      }
    }
  } catch {
    /* ignore */
  }

  // The latest digest stands in for older sessions: one short read of the
  // past week instead of every note from it.
  try {
    const digests = (await readDirFn(path.join(rootPath, "notes/company/digests"))).filter((f) => f.endsWith(".md")).sort().reverse()
    if (digests.length > 0) {
      const digest = await readFileFn(path.join(rootPath, "notes/company/digests", digests[0]), "utf-8")
      if (digest.trim()) {
        add(3, `## notes/company/digests/${digests[0]}\n${capText(digest.trim(), 1_200)}`)
        alreadyIncluded.add(`notes/company/digests/${digests[0]}`)
      }
    }
  } catch {
    /* ignore */
  }

  // 3. Notes that match this question, found locally.
  if (options.question) {
    const hits = await findRelevantNotes(rootPath, options.question, readFileFn, readDirFn, alreadyIncluded)
    if (hits.length > 0) {
      add(3, `## Notes that match this question\n${hits.map((h) => `### ${h.path}\n${h.snippet}`).join("\n\n")}`)
    }
  }

  // 4. Most recent decisions (up to 3)
  try {
    const decisions = await readDirFn(path.join(rootPath, "docs/decisions"))
    const mdDecisions = decisions.filter((f) => f.endsWith(".md") && !f.toLowerCase().startsWith("readme")).sort().reverse().slice(0, 3)
    for (const file of mdDecisions) {
      try {
        const dec = await readFileFn(path.join(rootPath, "docs/decisions", file), "utf-8")
        if (dec.trim()) add(5, `## docs/decisions/${file}\n${dec.trim().slice(0, 500)}`)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  // 5. Most recent milestone retrospective
  try {
    const retros = await readDirFn(path.join(rootPath, "docs/retros"))
    const mdRetros = retros.filter((f) => f.endsWith(".md") && !f.toLowerCase().startsWith("readme")).sort().reverse().slice(0, 1)
    if (mdRetros.length > 0) {
      try {
        const retro = await readFileFn(path.join(rootPath, "docs/retros", mdRetros[0]), "utf-8")
        if (retro.trim()) add(5, `## docs/retros/${mdRetros[0]}\n${retro.trim().slice(0, 500)}`)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  // 6. Live Operational Records & Metrics
  try {
    const opsLines: string[] = []

    // Ledger balance
    try {
      const raw = await readFileFn(path.join(rootPath, "records", "finances", "transactions.yaml"), "utf-8")
      const parsed = yaml.parse(raw)
      if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
        let inc = 0, exp = 0
        for (const t of parsed.records) {
          if (t.type === "income") inc += Number(t.amount || 0)
          else if (t.type === "expense") exp += Number(t.amount || 0)
        }
        opsLines.push(`Ledger Balance: $${(inc - exp).toLocaleString()} ($${inc.toLocaleString()} income, $${exp.toLocaleString()} expense)`)
      }
    } catch {
      /* ignore */
    }

    // Active pipeline
    try {
      const raw = await readFileFn(path.join(rootPath, "records", "funnel", "leads.yaml"), "utf-8")
      const parsed = yaml.parse(raw)
      if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
        const active = parsed.records.filter((l: { stage?: string; value?: number }) => l.stage !== "lost")
        const val = active.reduce((sum: number, l: { stage?: string; value?: number }) => sum + Number(l.value || 0), 0)
        opsLines.push(`Pipeline: $${val.toLocaleString()} across ${active.length} active deal(s)`)
      }
    } catch {
      /* ignore */
    }

    // Social / audience
    try {
      const raw = await readFileFn(path.join(rootPath, "records", "social", "snapshots.yaml"), "utf-8")
      const parsed = yaml.parse(raw)
      if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
        const latest = parsed.records[parsed.records.length - 1]
        if (typeof latest?.totalFollowers === "number") {
          opsLines.push(`Audience: ${latest.totalFollowers.toLocaleString()} followers`)
        }
      }
    } catch {
      try {
        const raw = await readFileFn(path.join(rootPath, "records", "social", "accounts.yaml"), "utf-8")
        const parsed = yaml.parse(raw)
        if (parsed && Array.isArray(parsed.records)) {
          const total = parsed.records.reduce((sum: number, a: { followers?: number }) => sum + Number(a.followers || 0), 0)
          opsLines.push(`Audience: ${total.toLocaleString()} followers`)
        }
      } catch {
        /* ignore */
      }
    }

    // Content items
    try {
      const raw = await readFileFn(path.join(rootPath, "records", "content", "items.yaml"), "utf-8")
      const parsed = yaml.parse(raw)
      if (parsed && Array.isArray(parsed.records)) {
        opsLines.push(`Content: ${parsed.records.length} item(s)`)
      }
    } catch {
      /* ignore */
    }

    // Discovered departments
    try {
      const recs = await readDirFn(path.join(rootPath, "records"))
      const depts = recs.filter((e) => !e.startsWith(".") && !e.includes("."))
      if (depts.length > 0) {
        const labels = await departmentLabels(rootPath, depts, (p) => readFileFn(p, "utf-8"))
        opsLines.push(`Departments: ${labels.join(", ")}`)
      }
    } catch {
      /* ignore */
    }

    if (opsLines.length > 0) {
      sections.push(`## Live Operational Records & Metrics\n${opsLines.map((l) => `- ${l}`).join("\n")}`)
    }
  } catch {
    /* ignore */
  }

  return withinBudget(tiers, MEMORY_BUDGET_CHARS)
}

/** Highest-priority tiers first; whatever doesn't fit is left on disk. */
export function withinBudget(tiers: Array<{ priority: number; text: string }>, budget: number): string {
  const ordered = [...tiers].sort((a, b) => a.priority - b.priority)
  const kept: string[] = []
  let used = 0
  for (const { text } of ordered) {
    const room = budget - used - (kept.length > 0 ? 2 : 0)
    if (room <= 200) break
    const piece = text.length <= room ? text : `${text.slice(0, room - 1)}…`
    kept.push(piece)
    used += piece.length + (kept.length > 1 ? 2 : 0)
  }
  return kept.join("\n\n")
}

function capText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** HANDOFF.md is appended to under `## ` headings; only the last one is current. */
export function latestHandoffEntry(handoff: string, max = 2_000): string {
  const text = handoff.trim()
  const starts = [...text.matchAll(/^## /gm)].map((m) => m.index ?? 0)
  const latest = starts.length > 0 ? text.slice(starts[starts.length - 1]) : text
  return capText(latest.trim(), max)
}

/**
 * A company card nobody has touched for months is still presented as fact. The
 * newest date the file carries (frontmatter `updated:` or any YYYY-MM-DD) says
 * how old it is; past 60 days the card says so, so the answer can hedge.
 */
export function stalenessNote(text: string, now: Date): string {
  const dates = [...text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)]
    .map((m) => Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    .filter((t) => !Number.isNaN(t) && t <= now.getTime())
  if (dates.length === 0) return ""
  const days = Math.floor((now.getTime() - Math.max(...dates)) / 86_400_000)
  return days > 60 ? `\n(Last updated ${days} days ago; parts of this may be out of date. Say so if it matters to the answer.)` : ""
}

const STOPWORDS = new Set(
  "what when where which while with that this than then them they their there these those have from about would could should does your yours into over just like want need know tell show give make company business please".split(" ")
)
const SEARCH_DIRS = ["notes/company/sessions", "notes/company/digests", "notes/company", "notes", "docs/decisions", "docs/retros"]

/**
 * Local keyword search over the company's notes and decisions: the memory can
 * grow without every question paying for all of it. Plain term counting — no
 * index to keep in sync, no tokens, and fast at the size a company's notes are.
 */
export async function findRelevantNotes(
  rootPath: string,
  question: string,
  readFileFn: ReadFileFn = defaultReadFile,
  readDirFn: ReadDirFn = defaultReadDir,
  exclude: Set<string> = new Set(),
  limit = 3
): Promise<Array<{ path: string; snippet: string }>> {
  const terms = [...new Set(question.toLowerCase().split(/[^a-z0-9]+/))].filter((t) => t.length >= 4 && !STOPWORDS.has(t))
  if (terms.length === 0) return []
  const scored: Array<{ path: string; score: number; text: string }> = []
  for (const dir of SEARCH_DIRS) {
    const files = (await readDirFn(path.join(rootPath, dir))).filter((f) => f.endsWith(".md")).slice(0, 300)
    for (const file of files) {
      const rel = `${dir}/${file}`
      if (exclude.has(rel) || scored.some((s) => s.path === rel)) continue
      let text: string
      try {
        text = await readFileFn(path.join(rootPath, rel), "utf-8")
      } catch {
        continue
      }
      const lower = text.toLowerCase()
      let score = 0
      for (const term of terms) {
        const count = lower.split(term).length - 1
        score += Math.min(count, 5) + (file.toLowerCase().includes(term) ? 3 : 0)
      }
      if (score > 0) scored.push({ path: rel, score, text })
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || b.path.localeCompare(a.path))
    .slice(0, limit)
    .map(({ path: rel, text }) => {
      const lower = text.toLowerCase()
      const at = Math.max(0, Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0)) - 150)
      return { path: rel, snippet: capText(text.slice(at, at + 600).trim(), 600) }
    })
}

const MAX_QUESTION_LENGTH = 2000

/**
 * Grounded the same way orientation/Get Started are: the cached summary plus
 * Read/Grep/Glob on the company's own repo, never a prefetch splicing in
 * anyone else's text. That is what keeps this off the `untrustedInput` path —
 * it is the user's own spoken question about their own company, the same
 * trust level as anything else they type into this app.
 */
/** Where the cross-company assistant runs, and any agent that can't be held
 *  to read-only: an empty folder, so there is nothing in reach to change. */
export function assistantWorkspaceDir(): string {
  return dataPath("assistant-workspace")
}

/**
 * The folder an assistant answer runs in. Every agent stays selectable for the
 * Assistant; what changes is where it runs. An agent that enforces a tool scope
 * (Claude Code, Kiro) runs in the company's folder and can look things up. One
 * that auto-approves every tool (Kimi's --yolo, Antigravity's
 * --dangerously-skip-permissions) runs in the empty assistant folder instead,
 * answering from the context the app already put in the prompt — so ignoring
 * the prompt's read-only rule has no company files to touch.
 */
export async function askCwdFor(executor: AiExecutor, companyRoot: string): Promise<{ cwd: string; fileAccess: boolean }> {
  if (executor.enforcesToolScope) return { cwd: companyRoot, fileAccess: true }
  const cwd = assistantWorkspaceDir()
  await mkdir(cwd, { recursive: true })
  return { cwd, fileAccess: false }
}

export function buildAskCompanyPrompt(
  question: string,
  persona: AssistantPersona | null = null,
  preloadedContext?: string,
  /** False when the run is in the empty assistant folder (see askCwdFor). */
  fileAccess = true
): string {
  const contextNote = preloadedContext
    ? `\n\nPreloaded company context (already read from this repository to answer directly in one turn):\n${preloadedContext}\n\nIf the preloaded context above is sufficient to answer the question, answer directly without calling Read, Grep, or Glob tools.`
    : ""

  return `Someone at this company is asking you a question out loud and wants a short spoken answer back, not a written report.

${fileAccess ? "" : "You have no file access in this run: the company context below is everything the app read for you, so answer from it and never offer to open or check a file. The rest of this paragraph describes what those files are.\n\n"}Ground your answer in this company's own files: read docs/company-summary.md first if it exists, and use Read, Grep and Glob on this repository for anything more specific — definitions/ontology/company.yaml, HANDOFF.md, notes/, docs/decisions/, docs/retros/, and notes/company/sessions/. Those last few aren't just facts to look up — they're a record of how this company actually works: decisions made and why, what happened in retros, what's been worked on recently, and — in HANDOFF.md specifically — what was last done and what's still open. Weigh that history, not just static definitions, when answering. If the files don't answer it, say so plainly instead of guessing.

Answer in 2-4 plain sentences, no markdown, no headings, no bullet points — this gets read aloud. If — and only if — this company's own history clearly points to a concrete next step directly relevant to the question, make your last sentence that suggestion; otherwise just answer, with no suggestion tacked on. Do not create, write, or edit any files; you are only answering a question.
${buildPersonaBlock(persona)}${contextNote}

Question: ${question}`
}

export { asEnvelopeResult } from "./assistant/voice-envelope"

export type AskCompanyResult =
  /** `english` is present only when the question was spoken in another
   *  language AND the model returned a usable translation — the transcript
   *  rail shows it as "heard: …". Absent means "not asked for, or not
   *  returned", never "the translation was empty". */
  | { ok: true; answer: string; english?: string }
  | { ok: false; message: string }

/**
 * Answers one spoken (or typed) question about a company, read-only.
 *
 * Deliberately not a CompanyCommand: every registry command's whole shape is
 * "write a file, show a diff, wait for approval" (run-company-command-impl.ts),
 * which is right for something that changes the company's memory and wrong
 * for a question that changes nothing — there is no diff to review, and
 * making a voice assistant wait on a manual approval before it can speak
 * would defeat the point of it. Spawns synchronously and returns the answer
 * directly instead of the detached-spawn-plus-log-tail shape those use.
 */
export async function askCompanyImpl(
  agentId: string,
  question: string,
  /** The language it was SPOKEN in, when that isn't English — switches the
   *  prompt to the translate-and-answer envelope. Omitted for typed questions
   *  and for English, which keep the plain-text path unchanged. */
  spokenLanguage?: string,
  resolveExecutor: ResolveExecutorFn = resolveAiExecutorForAgent,
  execFn: ExecFileFn = defaultExecFile,
  resolveAgentRoot: ResolveAgentRootFn = defaultResolveAgentRoot,
  /**
   * Its own seam, and every test must pass one — v75's rule. The default reads
  * a real file under the data directory, which in a test run is the repo's own
   * `.data/`, so a test that omits this reads whatever persona the developer
   * happens to have set and passes on CI while failing here.
   */
  readPersona: ReadPersonaFn = readPersonaForCompany,
  overrideExecutorId?: AiExecutorId,
  gatherContextFn: typeof gatherSingleCompanyContext = gatherSingleCompanyContext,
  /** Status questions answered from records with no AI call. Tests pass a stub. */
  answerLocallyFn: (question: string, rootPath: string) => Promise<string | null> = (q, root) =>
    answerLocally(q, localAnswerDepsFor(root, async () => null)),
  /** What other companies share with this one (lib/sharing). Tests pass a stub. */
  sharedKnowledgeFn: (agentId: string) => Promise<string> = sharedKnowledgeFor,
  /** `fast`: the spoken path, answered on the executor's quick model where it has one. */
  options: { fast?: boolean } = {}
): Promise<AskCompanyResult> {
  const trimmed = question.trim()
  if (!trimmed) {
    return { ok: false, message: "Didn't catch a question." }
  }
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return { ok: false, message: `That's a bit long for a spoken question (max ${MAX_QUESTION_LENGTH} characters).` }
  }

  const rootPath = await resolveAgentRoot(agentId)
  if (!rootPath) {
    return { ok: false, message: `Unknown company "${agentId}"` }
  }

  if (!spokenLanguage) {
    const local = await answerLocallyFn(trimmed, rootPath)
    if (local) return { ok: true, answer: local }
  }

  const [executor, persona, ownContext, shared] = await Promise.all([
    overrideExecutorId && overrideExecutorId in AI_EXECUTORS
      ? Promise.resolve(getAiExecutor(overrideExecutorId))
      : resolveExecutor(agentId),
    readPersona(rootPath),
    gatherContextFn(rootPath, undefined, undefined, { question: trimmed }),
    sharedKnowledgeFn(agentId),
  ])
  // Appended after the company's own memory, so a company with no strings sends
  // exactly what it sent before.
  const preloadedContext = shared ? `${ownContext}\n\n${shared}` : ownContext
  const wantsEnvelope = Boolean(spokenLanguage)
  const { cwd, fileAccess } = await askCwdFor(executor, rootPath)
  const args = [...executor.buildArgs({
    prompt:
      buildAskCompanyPrompt(trimmed, persona, preloadedContext, fileAccess) + (spokenLanguage ? voiceEnvelopeInstruction(spokenLanguage) : ""),
    // No file edits are part of answering a question. Edit() takes a
    // pattern, so this points at a path nothing writes to rather than
    // inventing a scope — same idiom as installRepairImpl's editScopePattern.
    editScopePattern: ".alacran-never-written/**",
    bashPatterns: [],
  }), ...(options.fast ? (executor.routineModelArgs ?? []) : [])]

  try {
    const { stdout, stderr } = await execFn(executor.binaryName, args, { cwd })
    const answer = stdout.trim()
    if (!answer) {
      const cleaned = cleanAssistantStderr(stderr)
      const raw = cleaned || (stderr.trim().startsWith("Reading additional input") ? "Got no answer back." : stderr.trim()) || "Got no answer back."
      return { ok: false, message: explainAssistantFailure(raw, executor.label) }
    }
    return wantsEnvelope ? asEnvelopeResult(answer) : { ok: true, answer }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const cleaned = cleanAssistantStderr(e.stderr ?? "")
    const message =
      (e.stdout ?? "").trim() ||
      cleaned ||
      e.message ||
      (e.stderr ?? "").trim() ||
      String(err)
    return { ok: false, message: explainAssistantFailure(message, executor.label) }
  }
}
