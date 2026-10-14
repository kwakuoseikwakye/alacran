import { readFile, mkdir, writeFile, realpath } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { recordOutcome } from "../os/preferences/outcomes"
import type { CompanyCommand } from "./types"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"
import { isSafePostFileName } from "../content-social/posts"

export type RevisionRequest = { feedback: string; outputPath: string; expectedText: string }

/** Keep the original approval baseline and a copy of the proposal before any
 * AI edits it. A revision never turns an unread proposal into approved history. */
export async function prepareRevision(command: CompanyCommand, request: RevisionRequest, dataDir: string, root: string) {
  if (!request.feedback.trim() || request.feedback.length > 4000) throw new Error("Describe the changes you want in 4,000 characters or fewer.")
  const record = await readFile(path.join(dataDir, `${command.id}.run.json`), "utf-8")
  const parsed = JSON.parse(record)
  if (parsed.outputPath !== command.outputPath || parsed.outputKind !== command.outputKind) throw new Error("This proposal cannot be revised because its saved location is invalid.")
  const rootPath = await realpath(root)
  const expected = await realpath(path.join(root, command.outputPath))
  const target = await realpath(path.join(root, request.outputPath))
  if (!expected.startsWith(rootPath + path.sep) || !(command.outputKind === "known-file" ? target === expected : target.startsWith(expected + path.sep))) {
    throw new Error("This proposal is outside the allowed document location.")
  }
  const stale = new Error("This proposal has changed. Refresh it before requesting a revision.")
  let result: { outputPath: string; newText: string }
  if (command.outputKind === "new-file-in-dir") {
    // Any waiting file, not just the one the generic result reader lists
    // first — a batch of posts is reviewed one card at a time.
    const name = path.basename(request.outputPath)
    const before: unknown[] = Array.isArray(parsed.before) ? parsed.before : []
    if (target !== path.join(expected, name) || before.includes(name) || !isSafePostFileName(name)) throw stale
    const newText = await readFile(target, "utf-8")
    if (newText !== request.expectedText) throw stale
    result = { outputPath: path.join(command.outputPath, name), newText }
  } else {
    const known = await getCompanyCommandResultImpl(command.id, dataDir, root, undefined, false)
    if (!known.changed || known.outputPath !== request.outputPath || known.newText !== request.expectedText) throw stale
    result = known
  }
  const archive = path.join(dataDir, "revisions")
  await mkdir(archive, { recursive: true })
  await writeFile(path.join(archive, `${command.id}-${randomUUID()}.json`), JSON.stringify({
    createdAt: new Date().toISOString(), feedback: request.feedback.trim(), record: JSON.parse(record),
    outputPath: result.outputPath, proposal: result.newText,
  }), { flag: "wx", mode: 0o600 })
  await recordOutcome(dataDir, { command: command.id, outcome: "revised", kind: command.outputKind, files: 1, feedback: request.feedback })
  return {
    editScopePattern: result.outputPath,
    prompt: `Revise the existing draft in ${result.outputPath} using the owner's feedback below. Read the draft first and preserve its format and all unrelated content. Do not invent missing facts. Write only this same file. Do not create other files, commit, publish, contact anyone, or execute commands. This remains a draft awaiting approval.\n\nOwner's requested changes:\n${request.feedback.trim()}`,
  }
}
