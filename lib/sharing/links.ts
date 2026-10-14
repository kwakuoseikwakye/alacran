import { readFile, writeFile, mkdir } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { dataPath } from "../data-dir"
import { DEFAULT_SHARE_SCOPE, cleanShareScope, type ShareLink, type ShareScope } from "./model"

/**
 * The strings between companies, in their own file in the data directory (one
 * writer, never a field in another registry — the split `session-note-status.ts`
 * explains). Machine-local on purpose: a link names two companies by the ids
 * this install gave them, which another machine would not share, so writing it
 * into a company's repo would put a dangling reference in the portable core.
 *
 * Read-modify-write with no lock: one person on one machine draws these, and a
 * lost update means a string reappearing, not lost work.
 */
const DEFAULT_PATH = dataPath("company-links.json")

type Result = { ok: true; link: ShareLink } | { ok: false; message: string }

async function readAll(file: string): Promise<ShareLink[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(file, "utf-8"))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: ShareLink[] = []
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue
    const { id, from, to, scope, createdAt } = entry as Record<string, unknown>
    // Field-checked: this decides what one company's assistant may read of
    // another's, so a half-written entry is dropped rather than guessed at.
    if (typeof id !== "string" || typeof from !== "string" || typeof to !== "string" || from === to) continue
    const cleaned = cleanShareScope(scope)
    if (!cleaned) continue
    out.push({ id, from, to, scope: cleaned, createdAt: typeof createdAt === "string" ? createdAt : "" })
  }
  return out
}

async function save(links: ShareLink[], file: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(links, null, 2)}\n`, "utf-8")
}

export async function listLinksImpl(file: string = DEFAULT_PATH): Promise<ShareLink[]> {
  return readAll(file)
}

/** Both ids are checked against the companies that exist, not trusted: a string
 *  to a company that is not there would silently share with nothing. */
export async function createLinkImpl(
  input: { from: string; to: string; scope?: unknown },
  deps: { file?: string; knownIds: () => Promise<string[]> }
): Promise<Result> {
  const file = deps.file ?? DEFAULT_PATH
  if (input.from === input.to) return { ok: false, message: "A company can't share with itself." }
  const known = await deps.knownIds()
  if (!known.includes(input.from) || !known.includes(input.to)) return { ok: false, message: "That company isn't here any more." }
  const scope = input.scope === undefined ? DEFAULT_SHARE_SCOPE : cleanShareScope(input.scope)
  if (!scope) return { ok: false, message: "Choose at least one thing to share." }
  const current = await readAll(file)
  if (current.some((l) => l.from === input.from && l.to === input.to)) {
    return { ok: false, message: "These two companies are already connected that way." }
  }
  const link: ShareLink = { id: `l${randomUUID().replace(/-/g, "").slice(0, 12)}`, from: input.from, to: input.to, scope, createdAt: new Date().toISOString() }
  await save([...current, link], file)
  return { ok: true, link }
}

export async function updateLinkScopeImpl(id: string, rawScope: unknown, file: string = DEFAULT_PATH): Promise<Result> {
  const scope: ShareScope | null = cleanShareScope(rawScope)
  if (!scope) return { ok: false, message: "Choose at least one thing to share, or cut the string." }
  const current = await readAll(file)
  const found = current.find((l) => l.id === id)
  if (!found) return { ok: false, message: "That string isn't here any more." }
  const updated = { ...found, scope }
  await save(current.map((l) => (l.id === id ? updated : l)), file)
  return { ok: true, link: updated }
}

export async function deleteLinkImpl(id: string, file: string = DEFAULT_PATH): Promise<Result> {
  const current = await readAll(file)
  const found = current.find((l) => l.id === id)
  if (!found) return { ok: false, message: "That string isn't here any more." }
  await save(current.filter((l) => l.id !== id), file)
  return { ok: true, link: found }
}
