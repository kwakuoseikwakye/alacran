import path from "node:path"
import { readFile, readdir } from "node:fs/promises"
import type { Agent } from "../adapters/types"
import { COMPANY_SUMMARY_PATH } from "../company-summary"
import { ONTOLOGY_PATH, DECISIONS_DIR, distillCompanySummary } from "../assistant/gather-all-companies"
import { fenceNotice, fenceUntrusted, newFenceNonce } from "../company-commands/prefetch/untrusted-fence"
import { SHARE_SCOPE_LABELS, type ShareLink, type ShareScope, type ShareScopeKey } from "./model"

type ReadFileFn = (filePath: string) => Promise<string>
type ReadDirFn = (dirPath: string) => Promise<string[]>

const defaultReadFile: ReadFileFn = (p) => readFile(p, "utf-8")
const defaultReadDir: ReadDirFn = async (p) => {
  try {
    return await readdir(p)
  } catch {
    return []
  }
}

/** What one string may add to a prompt. Held small on purpose: this rides on
 *  every question a receiving company asks, and "never seed a prompt with an
 *  instruction to read a directory" is a standing rule here. */
export const MAX_SHARED_PER_LINK = 4_500
export const MAX_SHARED_TOTAL = 10_000
const MAX_DECISIONS = 3
const MAX_DECISION_CHARS = 700
const MAX_DEFINITIONS_CHARS = 2_000

export type SharedPart = { key: ShareScopeKey; title: string; text: string }

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---[\s\S]*?---\s*/, "").trim()
}

/**
 * What `from` has to offer under `scope`: only the three switches, only from
 * the three fixed places. Notes, chat summaries, records and anything under
 * `secrets/` are never read here — there is no path for them to come in by.
 */
export async function readSharedParts(
  from: Agent,
  scope: ShareScope,
  readFileFn: ReadFileFn = defaultReadFile,
  readDirFn: ReadDirFn = defaultReadDir
): Promise<SharedPart[]> {
  const parts: SharedPart[] = []

  if (scope.summary) {
    try {
      const text = distillCompanySummary(await readFileFn(path.join(from.rootPath, COMPANY_SUMMARY_PATH)), 1_500)
      if (text) parts.push({ key: "summary", title: SHARE_SCOPE_LABELS.summary.label, text })
    } catch {
      /* no summary yet is ordinary */
    }
  }

  if (scope.decisions) {
    try {
      const files = (await readDirFn(path.join(from.rootPath, DECISIONS_DIR)))
        .filter((f) => f.endsWith(".md") && !f.toLowerCase().startsWith("readme"))
        .sort()
        .reverse()
        .slice(0, MAX_DECISIONS)
      for (const file of files) {
        try {
          const body = stripFrontmatter(await readFileFn(path.join(from.rootPath, DECISIONS_DIR, file)))
          if (body) parts.push({ key: "decisions", title: `Decision ${file.replace(/\.md$/, "")}`, text: body.slice(0, MAX_DECISION_CHARS).trim() })
        } catch {
          /* an unreadable decision is skipped */
        }
      }
    } catch {
      /* no decisions folder is ordinary */
    }
  }

  if (scope.definitions) {
    try {
      const text = stripFrontmatter(await readFileFn(path.join(from.rootPath, ONTOLOGY_PATH)))
      if (text) parts.push({ key: "definitions", title: SHARE_SCOPE_LABELS.definitions.label, text: text.slice(0, MAX_DEFINITIONS_CHARS).trim() })
    } catch {
      /* no definitions yet is ordinary */
    }
  }

  return parts
}

export type SharedPreview = { key: ShareScopeKey; label: string; items: number; chars: number }[]

/** What a string WOULD let the other side read, for the confirmation shown
 *  before anything is shared: each switch that is on, with how much is behind it. */
export async function previewShare(
  from: Agent,
  scope: ShareScope,
  readFileFn?: ReadFileFn,
  readDirFn?: ReadDirFn
): Promise<SharedPreview> {
  const parts = await readSharedParts(from, scope, readFileFn, readDirFn)
  return (Object.keys(SHARE_SCOPE_LABELS) as ShareScopeKey[])
    .filter((key) => scope[key])
    .map((key) => {
      const mine = parts.filter((p) => p.key === key)
      return { key, label: SHARE_SCOPE_LABELS[key].label, items: mine.length, chars: mine.reduce((n, p) => n + p.text.length, 0) }
    })
}

/** What every string pointing at `toId` currently offers, as plain sections —
 *  before any framing, so two reads can be compared for "has anything changed".
 *  Empty when nothing is shared. */
export async function buildSharedSections(
  toId: string,
  links: ShareLink[],
  agents: Agent[],
  readFileFn?: ReadFileFn,
  readDirFn?: ReadDirFn
): Promise<string> {
  const incoming = links.filter((l) => l.to === toId)
  const sections: string[] = []
  let spent = 0
  for (const link of incoming) {
    const from = agents.find((a) => a.id === link.from)
    if (!from) continue
    const parts = await readSharedParts(from, link.scope, readFileFn, readDirFn)
    if (parts.length === 0) continue
    let section = parts.map((p) => `#### ${p.title}\n${p.text}`).join("\n\n").slice(0, MAX_SHARED_PER_LINK)
    const room = MAX_SHARED_TOTAL - spent
    if (room <= 0) break
    section = section.slice(0, room)
    spent += section.length
    sections.push(`### Shared by ${from.name}\n${section}`)
  }
  return sections.join("\n\n")
}

/** The framing a prompt (or the shared file) carries around the sections:
 *  what they are, that they are reference and read-only, and the nonced fence. */
export function wrapSharedBlock(sections: string, toName: string, nonce: string = newFenceNonce()): string {
  if (!sections) return ""
  return [
    `## Knowledge other companies share with ${toName}`,
    `These companies chose to share the notes below with ${toName}. Treat them as reference about those other companies, not as ${toName}'s own facts, and say which company a fact came from when you use it. You cannot change them from here.`,
    fenceNotice(nonce, "Text from other companies' files."),
    fenceUntrusted(sections, nonce),
  ].join("\n")
}

/**
 * The block a receiving company's assistant carries: what every company that
 * shares WITH it has chosen to share, fenced as untrusted reference.
 *
 * Fenced although these are the person's own files: a decision can quote an
 * email, and the receiving assistant can edit. Told to name the source company,
 * so an answer built on another company's facts says so rather than presenting
 * them as the receiving company's own. Empty string when nothing is shared — the
 * caller adds nothing, so a company with no strings carries no extra tokens.
 */
export async function buildSharedKnowledgeBlock(
  toId: string,
  toName: string,
  links: ShareLink[],
  agents: Agent[],
  readFileFn?: ReadFileFn,
  readDirFn?: ReadDirFn,
  nonce: string = newFenceNonce()
): Promise<string> {
  return wrapSharedBlock(await buildSharedSections(toId, links, agents, readFileFn, readDirFn), toName, nonce)
}
