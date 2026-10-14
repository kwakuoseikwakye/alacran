/**
 * Brain dump: turn a voice/text capture into a real markdown memory file.
 * The file is the source of truth for working context notes.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const DEFAULT_STORE =
  process.env.GBRAIN_STORE ?? path.join(os.homedir(), "knowledge", "brain-store")

export type BrainDumpInput = {
  text: string
  title?: string
  folder: string // top-level folder, e.g. 'inbox' | 'ideas'
  tags: string[] // venture tags etc.
}

export type BrainDumpResult = { relPath: string; title: string; slug: string }

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return slug || "untitled"
}

export function writeBrainDump(
  input: BrainDumpInput,
  storePath: string = DEFAULT_STORE
): BrainDumpResult {
  const text = input.text.trim()
  if (!text) throw new Error("brain dump is empty")
  if (!/^[a-z0-9-]+$/i.test(input.folder)) {
    throw new Error(`invalid folder: ${input.folder} — one top-level folder, no slashes`)
  }

  const title = input.title?.trim() || text.split(/\s+/).slice(0, 7).join(" ")
  const date = new Date().toISOString().slice(0, 10)
  const base = `${date}-${slugifyTitle(title)}`

  const dir = path.join(storePath, input.folder)
  fs.mkdirSync(dir, { recursive: true })

  let slug = base
  for (let n = 2; fs.existsSync(path.join(dir, `${slug}.md`)); n++) {
    slug = `${base}-${n}`
  }

  const tags = input.tags.map((t) => t.trim()).filter(Boolean)
  const body = [
    "---",
    `created: ${new Date().toISOString()}`,
    "source: alacran-brain-dump",
    `tags: [${tags.join(", ")}]`,
    "---",
    "",
    `# ${title}`,
    "",
    text,
    "",
  ].join("\n")

  const relPath = `${input.folder}/${slug}.md`
  fs.writeFileSync(path.join(storePath, relPath), body, "utf8")
  return { relPath, title, slug }
}

export type BrainDumpDeps = {
  writeLocal?: (input: BrainDumpInput, storePath?: string) => BrainDumpResult
  capture?: (input: { text: string; title: string }) => Promise<{ ok: boolean; slug?: string; error?: string }>
  storePath?: string
}

export type IngestResult = BrainDumpResult & {
  embedded: boolean
  captureError?: string
}

export async function ingestBrainDump(
  input: BrainDumpInput,
  deps: BrainDumpDeps = {}
): Promise<IngestResult> {
  const writeLocal = deps.writeLocal ?? writeBrainDump
  const local = writeLocal(input, deps.storePath)

  if (!deps.capture) return { ...local, embedded: false }

  const outcome = await deps.capture({ text: input.text, title: local.title })
  return outcome.ok
    ? { ...local, embedded: true, slug: outcome.slug ?? local.slug }
    : { ...local, embedded: false, captureError: outcome.error }
}

export type InboxCaptureInput = {
  text: string
  title?: string
  companyRoot: string
  tags?: string[]
}

export type InboxCaptureResult = {
  ok: true
  relPath: string
  timestamp: string
  title: string
  slug: string
}

export function appendInboxCapture(input: InboxCaptureInput): InboxCaptureResult {
  const text = input.text.trim()
  if (!text) throw new Error("inbox capture text is empty")
  const notesDir = path.join(input.companyRoot, "notes")
  fs.mkdirSync(notesDir, { recursive: true })
  const inboxPath = path.join(notesDir, "inbox.md")

  const timestamp = new Date().toISOString()
  const title = input.title?.trim() || text.split(/\s+/).slice(0, 7).join(" ")
  const tags = input.tags?.map((t) => t.trim()).filter(Boolean) ?? []
  const tagsLine = tags.length > 0 ? ` (tags: ${tags.join(", ")})` : ""

  const entry = `\n\n## [${timestamp}] ${title}${tagsLine}\n\n${text}\n`

  if (!fs.existsSync(inboxPath)) {
    fs.writeFileSync(inboxPath, `# Inbox\n\nWorking notes and incoming thoughts.${entry}`, "utf8")
  } else {
    fs.appendFileSync(inboxPath, entry, "utf8")
  }

  return {
    ok: true,
    relPath: "notes/inbox.md",
    timestamp,
    title,
    slug: "inbox",
  }
}
