import path from "node:path"
import { readFile, readdir } from "node:fs/promises"
import yaml from "yaml"
import { getEffectiveAgents } from "../get-effective-agents"
import { COMPANY_SUMMARY_PATH } from "../company-summary"
import type { Agent } from "../adapters/types"
import { parseInquiry } from "../comms/inquiries"
import { INQUIRIES_DIR } from "../comms/paths"
import { DEFINITIONS_REL } from "../os/departments/definitions"

/**
 * Cross-company context, gathered control-panel-side and handed to the agent as
 * prompt text.
 *
 * **This is deliberately NOT `--add-dir`, and that is the whole design.**
 * Verified against the real binaries: Claude Code 2.1.252 has
 * `--add-dir <directories...>` and Kimi 0.39.0 has `--add-dir <dir>`, but Kiro
 * 2.20.2 has no multi-directory flag at all — not in `chat --help`, not in
 * `--help-all`, and zero hits across 300,423 strings in its binary. A flag-based
 * design would make the one cross-company feature Claude-only, which is exactly
 * the executor lock-in this app exists to avoid. Every executor takes the prompt
 * as one argv string, so prompt content is the only mechanism that behaves
 * identically on all three.
 *
 * It is also this project's own precedent rather than a new idea: CLAUDE.md
 * records that the prefetch seam exists *because* "the spawned session's `cwd`
 * is the company's own root with no `--add-dir`", and `prefetch/types.ts` states
 * the contract — "Prefetch may read outside it; the spawned agent may not."
 */

export const ONTOLOGY_PATH = "definitions/ontology/company.yaml"
export const SESSIONS_DIR = "notes/company/sessions"
export const HANDOFF_PATH = "HANDOFF.md"
export const DECISIONS_DIR = "docs/decisions"
export const RETROS_DIR = "docs/retros"

/** Per company, and across all of them. A machine with thirty companies must
 *  not build an unbounded argv — see `truncated` and the name-only degradation
 *  below, which are what the caps produce instead of a hard failure. */
export const MAX_PER_COMPANY = 6_000
export const MAX_TOTAL = 60_000

export type CompanyPulse = {
  pendingReviewsCount: number
  lastSessionSummary?: string
  /** Messages the Comms job drafted a reply for that the person hasn't marked replied. */
  inquiriesWaiting?: number
}

export type CompanyOperationalDigest = {
  cashBalance?: string
  pipelineTotal?: string
  audienceCount?: number
  contentCount?: number
  departments?: string[]
}

export type DecisionIndexEntry = {
  companyId: string
  companyName: string
  slug: string
  title: string
  summary?: string
}


/**
 * Which tier of memory a company could actually supply.
 *
 * `name-only` is not a failure state — it is the state of every company on a
 * fresh install, because `docs/company-summary.md` is only written when Get
 * Started runs (measured: absent on 2 of 3 real companies on this machine). It
 * MUST be carried through to the prompt and labelled, so the model says "I don't
 * have a summary for Acme yet" instead of inferring a business from a folder
 * name. An invented company is the one failure this app's premise cannot absorb.
 */
export type ContextSource = "summary" | "ontology" | "name-only"

export type CompanyContext = {
  id: string
  name: string
  kind: string
  source: ContextSource
  /** Empty for `name-only`. */
  text: string
  truncated: boolean
  pulse?: CompanyPulse
  operations?: CompanyOperationalDigest
}

export type ReadFileFn = (filePath: string) => Promise<string>
export type ReadDirFn = (dirPath: string) => Promise<string[]>
export type ListPendingReviewsFn = (agents: Agent[]) => Promise<{ agentId: string; commandId: string }[]>

const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")
const defaultReadDir: ReadDirFn = async (dirPath) => {
  try {
    return await readdir(dirPath)
  } catch {
    return []
  }
}

/**
 * The department names the model reads, one per records folder. A folder that
 * has a definition in `definitions/departments.yaml` is shown by the
 * definition's CURRENT name, with its real folder name in brackets: the owner
 * can rename a department by voice, and the folder keeps its old name, so the
 * title-cased folder would contradict the change. The persona tells the model
 * to use the bracketed name when it proposes an edit or a removal. A folder
 * without a definition is shown by its title only, because a folder name made
 * up from the title would fail later on the card.
 */
export async function departmentLabels(
  rootPath: string,
  folders: string[],
  readFileFn: ReadFileFn
): Promise<string[]> {
  // slug -> name; an empty name still marks the folder as defined (the title stands in for it).
  const defined = new Map<string, string>()
  try {
    const parsed = yaml.parse(await readFileFn(path.join(rootPath, DEFINITIONS_REL)))
    for (const d of Array.isArray(parsed?.departments) ? parsed.departments : []) {
      if (typeof d?.slug === "string") defined.set(d.slug, typeof d.name === "string" ? d.name.trim() : "")
    }
  } catch {
    /* no definitions file is ordinary: no folder is backed by one */
  }
  return folders.map((folder) => {
    const title = folder.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    const name = defined.get(folder)
    return name === undefined ? title : `${name || title} (folder: ${folder})`
  })
}

const defaultListPendingReviews: ListPendingReviewsFn = async (agents) => {
  try {
    const { listPendingReviews } = await import("../company-commands/pending-reviews")
    return await listPendingReviews(agents)
  } catch {
    return []
  }
}


export function summarizeActivityText(raw: string, maxLen = 240): string {
  // Strip YAML frontmatter if present
  let cleaned = raw.replace(/^---[\s\S]*?---\s*/, "").trim()
  if (!cleaned) return ""

  // Extract "What we worked on" or "What's still open" if present in session notes
  const workedOnMatch = cleaned.match(/\*\*What we worked on\*\*([\s\S]*?)(?=\*\*What's still open\*\*|\*\*What we decided\*\*|\*\*Worth remembering\*\*|$)/i)
  const openMatch = cleaned.match(/\*\*What's still open\*\*([\s\S]*?)(?=\*\*Worth remembering\*\*|\*\*What we decided\*\*|$)/i)

  if (workedOnMatch || openMatch) {
    const workedOn = workedOnMatch ? workedOnMatch[1].replace(/^\s*[:—-]\s*/, "").trim().replace(/\s+/g, " ") : ""
    const open = openMatch ? openMatch[1].replace(/^\s*[:—-]\s*/, "").trim().replace(/\s+/g, " ") : ""
    const combined = [workedOn ? `Worked on: ${workedOn}` : "", open ? `Open: ${open}` : ""].filter(Boolean).join(" | ")
    return combined.slice(0, maxLen).trim()
  }

  // Check for markdown headers like ## Current Status or ## Next up in HANDOFF.md
  const statusMatch = cleaned.match(/## Current Status[\s\S]*?\n([\s\S]*?)(?=## Next up|---|$)/i)
  if (statusMatch && statusMatch[1].trim()) {
    cleaned = statusMatch[1].trim()
  }

  // Collapse whitespace and return snippet
  const singleLine = cleaned.replace(/\s+/g, " ")
  return singleLine.slice(0, maxLen).trim()
}

export async function readPulse(
  agent: Agent,
  pendingReviews: { agentId: string; commandId: string }[],
  readFileFn: ReadFileFn,
  readDirFn: ReadDirFn
): Promise<CompanyPulse | undefined> {
  const reviewsForAgent = pendingReviews.filter((r) => r.agentId === agent.id)
  const pendingReviewsCount = reviewsForAgent.length

  let lastSessionSummary: string | undefined

  // 1. Check notes/company/sessions/
  try {
    const sessionFiles = await readDirFn(path.join(agent.rootPath, SESSIONS_DIR))
    const mdFiles = sessionFiles.filter((f) => f.endsWith(".md")).sort().reverse()
    if (mdFiles.length > 0) {
      const content = await readFileFn(path.join(agent.rootPath, SESSIONS_DIR, mdFiles[0]))
      const summary = summarizeActivityText(content)
      if (summary) lastSessionSummary = summary
    }
  } catch {
    // Missing directory or unreadable is ordinary
  }

  // 2. Fall back to HANDOFF.md if no session note found
  if (!lastSessionSummary) {
    try {
      const handoffContent = await readFileFn(path.join(agent.rootPath, HANDOFF_PATH))
      const summary = summarizeActivityText(handoffContent)
      if (summary) lastSessionSummary = summary
    } catch {
      // Missing HANDOFF.md is ordinary
    }
  }

  // 3. Inquiries still waiting on a reply (Communications & inquiries).
  let inquiriesWaiting = 0
  const inquiriesDir = path.join(agent.rootPath, INQUIRIES_DIR)
  for (const name of (await readDirFn(inquiriesDir).catch(() => [])).filter((f) => f.endsWith(".md"))) {
    try {
      const inquiry = parseInquiry(await readFileFn(path.join(inquiriesDir, name)), name)
      if (inquiry && (inquiry.status === "pending" || inquiry.status === "approved")) inquiriesWaiting++
    } catch {
      /* unreadable card is skipped */
    }
  }

  if (pendingReviewsCount > 0 || lastSessionSummary || inquiriesWaiting > 0) {
    return {
      pendingReviewsCount,
      lastSessionSummary,
      ...(inquiriesWaiting > 0 ? { inquiriesWaiting } : {}),
    }
  }

  return undefined
}

export async function readOperations(
  agent: Agent,
  readFileFn: ReadFileFn,
  readDirFn: ReadDirFn
): Promise<CompanyOperationalDigest | undefined> {
  let cashBalance: string | undefined
  let pipelineTotal: string | undefined
  let audienceCount: number | undefined
  let contentCount: number | undefined
  let departments: string[] | undefined

  // 1. Finances ledger
  try {
    const raw = await readFileFn(path.join(agent.rootPath, "records", "finances", "transactions.yaml"))
    const parsed = yaml.parse(raw)
    if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
      let income = 0
      let expense = 0
      for (const tx of parsed.records) {
        const amt = Number(tx.amount || 0)
        if (tx.type === "income") income += amt
        else if (tx.type === "expense") expense += amt
      }
      const net = income - expense
      cashBalance = `$${net.toLocaleString()} net ($${income.toLocaleString()} in / $${expense.toLocaleString()} out)`
    }
  } catch {
    /* missing or unreadable is ordinary */
  }

  // 2. Sales pipeline
  try {
    const raw = await readFileFn(path.join(agent.rootPath, "records", "funnel", "leads.yaml"))
    const parsed = yaml.parse(raw)
    if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
      const active = parsed.records.filter((l: { stage?: string; value?: number }) => l.stage !== "lost")
      const total = active.reduce((sum: number, l: { stage?: string; value?: number }) => sum + Number(l.value || 0), 0)
      pipelineTotal = `$${total.toLocaleString()} across ${active.length} active deal${active.length === 1 ? "" : "s"}`
    }
  } catch {
    /* missing or unreadable is ordinary */
  }

  // 3. Social / audience
  try {
    const raw = await readFileFn(path.join(agent.rootPath, "records", "social", "snapshots.yaml"))
    const parsed = yaml.parse(raw)
    if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
      const latest = parsed.records[parsed.records.length - 1]
      if (typeof latest?.totalFollowers === "number") {
        audienceCount = latest.totalFollowers
      }
    }
  } catch {
    try {
      const raw = await readFileFn(path.join(agent.rootPath, "records", "social", "accounts.yaml"))
      const parsed = yaml.parse(raw)
      if (parsed && Array.isArray(parsed.records)) {
        audienceCount = parsed.records.reduce((sum: number, a: { followers?: number }) => sum + Number(a.followers || 0), 0)
      }
    } catch {
      /* missing or unreadable is ordinary */
    }
  }

  // 4. Content items
  try {
    const raw = await readFileFn(path.join(agent.rootPath, "records", "content", "items.yaml"))
    const parsed = yaml.parse(raw)
    if (parsed && Array.isArray(parsed.records)) {
      contentCount = parsed.records.length
    }
  } catch {
    /* missing or unreadable is ordinary */
  }

  // 5. Discovered departments
  try {
    const recordsEntries = await readDirFn(path.join(agent.rootPath, "records"))
    const discovered = recordsEntries.filter((e) => !e.startsWith(".") && !e.includes("."))
    if (discovered.length > 0) {
      departments = await departmentLabels(agent.rootPath, discovered, readFileFn)
    }
  } catch {
    /* missing or unreadable is ordinary */
  }

  if (cashBalance || pipelineTotal || audienceCount !== undefined || contentCount !== undefined || departments) {
    return {
      cashBalance,
      pipelineTotal,
      audienceCount,
      contentCount,
      departments,
    }
  }

  return undefined
}

/**
 * Strips verbose capability catalog tables from company-summary.md to prevent burning
 * tokens on repetitive descriptions of agent commands and workspace tools.
 */
export function distillCompanySummary(raw: string, maxLen = 1500): string {
  const cleaned = raw.replace(/^---[\s\S]*?---\s*/, "").trim()
  if (!cleaned) return ""
  const helpIndex = cleaned.search(/##\s+(?:What I Can Help With|Capabilities|Available Commands)/i)
  if (helpIndex > 0) {
    const intro = cleaned.slice(0, helpIndex).trim()
    if (intro.length >= 20) {
      return intro.slice(0, maxLen).trim()
    }
  }
  return cleaned.slice(0, maxLen).trim()
}

/**
 * Which companies the assistant speaks for. Exported so the page's picker and
 * the gather cannot drift — a company offered in the dropdown but absent from
 * the prompt would answer "I don't know that company" about one it just listed.
 *
 * `external` is excluded per v66: that kind is a folder following none of this
 * app's conventions, and a new company feature defaults to off for it.
 */
export function isAssistantCompany(agent: Agent): boolean {
  return agent.kind !== "external"
}

async function readFirst(
  agent: Agent,
  readFileFn: ReadFileFn
): Promise<{ source: ContextSource; text: string }> {
  for (const [source, relative] of [
    ["summary", COMPANY_SUMMARY_PATH],
    ["ontology", ONTOLOGY_PATH],
  ] as const) {
    try {
      const text = (await readFileFn(path.join(agent.rootPath, relative))).trim()
      if (text) return { source, text }
    } catch {
      // Missing or unreadable is ordinary here, not an error — fall through to
      // the next tier. A company with neither file is still a real company.
    }
  }
  return { source: "name-only", text: "" }
}

/**
 * Every company on this machine, each reduced to the best memory it can offer,
 * augmented with real-time operational pulse and live department records.
 *
 * Reads files only — no subprocess per company. This feeds a `force-dynamic`
 * page, where v70's rule applies: a third-party CLI called from a page runs on
 * every render, and there the cost was a GUI keychain dialog rather than CPU.
 *
 * `external` companies are excluded: that kind means a folder the user pointed
 * at which follows none of this app's conventions, and v66's standing rule is
 * that a new company feature defaults to off for it.
 */
export async function gatherAllCompanies(
  agents?: Agent[],
  readFileFn: ReadFileFn = defaultReadFile,
  listReviewsFn: ListPendingReviewsFn = defaultListPendingReviews,
  readDirFn: ReadDirFn = defaultReadDir
): Promise<CompanyContext[]> {
  const list = (agents ?? (await getEffectiveAgents())).filter(isAssistantCompany)
  const pendingReviews = await listReviewsFn(list).catch(() => [])

  const out: CompanyContext[] = []
  let spent = 0
  for (const agent of list) {
    const { source, text } = await readFirst(agent, readFileFn)
    const [pulse, operations] = await Promise.all([
      readPulse(agent, pendingReviews, readFileFn, readDirFn),
      readOperations(agent, readFileFn, readDirFn),
    ])
    // Once the total budget is gone the remaining companies still appear, by
    // name. Dropping them entirely would let the assistant answer "you have
    // four companies" on a machine with nine — a confident wrong answer, which
    // is worse than a thin one.
    const room = Math.max(0, Math.min(MAX_PER_COMPANY, MAX_TOTAL - spent))
    const kept = text.slice(0, room)
    spent += kept.length
    out.push({
      id: agent.id,
      name: agent.name,
      kind: agent.kind,
      source: kept ? source : "name-only",
      text: kept,
      truncated: kept.length < text.length,
      pulse,
      operations,
    })
  }
  return out
}

export async function gatherCrossCompanyDecisions(
  agents: Agent[],
  readFileFn: ReadFileFn = defaultReadFile,
  readDirFn: ReadDirFn = defaultReadDir
): Promise<DecisionIndexEntry[]> {
  const entries: DecisionIndexEntry[] = []

  for (const agent of agents) {
    if (!isAssistantCompany(agent)) continue

    // 1. Architecture Decisions
    try {
      const files = await readDirFn(path.join(agent.rootPath, DECISIONS_DIR))
      const mdFiles = files
        .filter((f) => f.endsWith(".md") && !f.toLowerCase().startsWith("readme"))
        .sort()
        .reverse()

      // Take up to 3 most recent decisions per company
      for (const file of mdFiles.slice(0, 3)) {
        try {
          const content = await readFileFn(path.join(agent.rootPath, DECISIONS_DIR, file))
          const slug = file.replace(/\.md$/, "")

          const titleMatch = content.match(/^#\s+(?:Decision:\s*)?(.*)$/m)
          const title = titleMatch ? titleMatch[1].trim() : slug

          const decisionMatch = content.match(/##\s+(?:Decision|What We Did)[\s\S]*?\n([^\n#]+)/i)
          const summary = decisionMatch ? decisionMatch[1].trim().replace(/\s+/g, " ") : undefined

          entries.push({
            companyId: agent.id,
            companyName: agent.name,
            slug,
            title,
            summary: summary ? summary.slice(0, 150) : undefined,
          })
        } catch {
          // unreadable decision file is skipped
        }
      }
    } catch {
      // missing docs/decisions is ordinary
    }

    // 2. Milestone Retrospectives
    try {
      const retroFiles = await readDirFn(path.join(agent.rootPath, RETROS_DIR))
      const mdRetros = retroFiles
        .filter((f) => f.endsWith(".md") && !f.toLowerCase().startsWith("readme"))
        .sort()
        .reverse()

      if (mdRetros.length > 0) {
        const file = mdRetros[0]
        try {
          const content = await readFileFn(path.join(agent.rootPath, RETROS_DIR, file))
          const slug = file.replace(/\.md$/, "")
          const titleMatch = content.match(/^#\s+(?:Retro:\s*|Retrospective:\s*)?(.*)$/m)
          const title = titleMatch ? `Retro: ${titleMatch[1].trim()}` : `Retro: ${slug}`

          const lessonMatch = content.match(/##\s+(?:What Went Well|Key Takeaway|Improvement|What We Learned)[\s\S]*?\n([^\n#]+)/i)
          const summary = lessonMatch ? lessonMatch[1].trim().replace(/\s+/g, " ") : undefined

          entries.push({
            companyId: agent.id,
            companyName: agent.name,
            slug,
            title,
            summary: summary ? summary.slice(0, 150) : undefined,
          })
        } catch {
          // unreadable retro is skipped
        }
      }
    } catch {
      // missing docs/retros is ordinary
    }
  }

  return entries
}

export type FormatCompanyContextOptions = {
  /** If provided and non-empty, only these companies receive full context; others are compressed to Tier-1. */
  focalCompanyIds?: string[]
  /** Cross-company decisions to append as an index for pattern borrowing. */
  crossCompanyDecisions?: DecisionIndexEntry[]
  /** Every company in the compressed tier — a roster beside another company's full context. */
  briefOnly?: boolean
}

/** The prompt block. One labelled section per company, so the model can always
 *  say which company a claim came from — and can see which ones it has nothing
 *  for. Supports two-tier retrieval compression and cross-company decision indexing. */
export function formatCompanyContext(
  contexts: CompanyContext[],
  options?: FormatCompanyContextOptions
): string {
  if (contexts.length === 0) return "There are no companies set up on this computer yet."

  const focalIds = options?.focalCompanyIds && options.focalCompanyIds.length > 0 ? options.focalCompanyIds : null

  const companyBlocks = contexts
    .map((c) => {
      const header = `### ${c.name}`
      const isFocal = !options?.briefOnly && (!focalIds || focalIds.includes(c.id))

      let body = ""
      if (c.source === "name-only") {
        body = `(No description written yet — this company exists but has no summary or company definition. Say so if asked about it; do not guess what it does.)`
      } else if (!isFocal) {
        // Tier-1 compressed representation for non-focal companies to save prompt tokens
        const compactSnippet = c.text.slice(0, 160).replace(/\s+/g, " ").trim() + (c.text.length > 160 ? "…" : "")
        body = `Summary (brief): ${compactSnippet}`
        if (c.operations) {
          const miniOps: string[] = []
          if (c.operations.cashBalance) miniOps.push(c.operations.cashBalance.split(" ")[0])
          if (c.operations.pipelineTotal) miniOps.push(`Pipeline: ${c.operations.pipelineTotal.split(" across")[0]}`)
          if (c.operations.departments?.length) miniOps.push(`${c.operations.departments.length} depts`)
          if (miniOps.length > 0) {
            body += ` | Operations: ${miniOps.join(", ")}`
          }
        }
      } else {
        // Full Tier-2 detailed representation for focal or broad queries
        const label = c.source === "summary" ? "Summary" : "Company definition"
        const content = c.source === "summary" ? distillCompanySummary(c.text) : c.text
        const tail = c.truncated ? "\n…(truncated)" : ""
        body = `${label}:\n${content}${tail}`
      }

      if (c.pulse) {
        const pulseLines = ["Operational Pulse:"]
        if (c.pulse.pendingReviewsCount > 0) {
          pulseLines.push(`- Pending reviews: ${c.pulse.pendingReviewsCount} uncommitted run(s) waiting for human approval.`)
        } else {
          pulseLines.push("- Pending reviews: None (working tree clean).")
        }
        if (c.pulse.inquiriesWaiting) {
          pulseLines.push(`- Inquiries waiting on a reply: ${c.pulse.inquiriesWaiting} (Communications & inquiries page).`)
        }
        if (c.pulse.lastSessionSummary) {
          pulseLines.push(`- Recent activity: ${c.pulse.lastSessionSummary}`)
        }
        body += `\n\n${pulseLines.join("\n")}`
      }

      if (c.operations && isFocal) {
        const opsParts: string[] = []
        if (c.operations.cashBalance) opsParts.push(`Ledger Balance: ${c.operations.cashBalance}`)
        if (c.operations.pipelineTotal) opsParts.push(`Pipeline: ${c.operations.pipelineTotal}`)
        if (c.operations.audienceCount !== undefined && c.operations.audienceCount > 0) opsParts.push(`Audience: ${c.operations.audienceCount.toLocaleString()} followers`)
        if (c.operations.contentCount !== undefined && c.operations.contentCount > 0) opsParts.push(`Content: ${c.operations.contentCount} item(s)`)
        if (c.operations.departments && c.operations.departments.length > 0) opsParts.push(`Departments: ${c.operations.departments.join(", ")}`)
        if (opsParts.length > 0) {
          body += `\n\nLive Operations & Records:\n${opsParts.map((p) => `- ${p}`).join("\n")}`
        }
      }

      return `${header}\n${body}`
    })
    .join("\n\n")

  if (options?.crossCompanyDecisions && options.crossCompanyDecisions.length > 0) {
    const decisionLines = options.crossCompanyDecisions.map((d) => {
      const desc = d.summary ? `: ${d.summary}` : ""
      return `- [${d.companyName}] ${d.slug} ("${d.title}")${desc}`
    })
    return `${companyBlocks}\n\n### Cross-Company Decision Index (Recent Architecture Choices & Retros):\n${decisionLines.join("\n")}`
  }

  return companyBlocks
}


