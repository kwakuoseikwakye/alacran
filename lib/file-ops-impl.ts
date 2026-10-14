import { isDirectory } from "./path-exists"
import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { resolveWithinAgentRoot } from "./path-guard"
import { commitFile, type ExecFileFn } from "./git-commit-file"
import { dataPath } from "./data-dir"

export type FileOpResult = { ok: true; message: string; path?: string } | { ok: false; message: string }

/** One entry in a company folder, for the "All files" tree. */
export type FolderEntry = { name: string; path: string; kind: "file" | "folder" }

/**
 * Directories that are never worth showing and are expensive to walk. `.git`
 * is the repo's own plumbing and `node_modules` can be six figures of files;
 * a file manager that lists either is a file manager nobody can use.
 */
const HIDDEN = new Set([".git", "node_modules", ".next", ".DS_Store"])

/**
 * A name the user typed, for a thing that does not exist yet.
 *
 * `resolveWithinAgentRoot` realpaths its argument, so it returns null for any
 * path that isn't there — which is every path a create is about. The guard
 * therefore runs on the PARENT, which does exist, and the name is checked
 * separately. Rejecting a separator is what stops `../../etc/passwd` from
 * being a "name"; `path.basename` alone would silently accept and truncate it,
 * which is worse than refusing.
 */
function nameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return "Give it a name."
  if (trimmed === "." || trimmed === "..") return "That name is reserved."
  if (trimmed.includes("/") || trimmed.includes("\\")) return "A name can't contain a slash. Use Move to put it somewhere else."
  if (trimmed.includes("\0")) return "That name isn't valid."
  return null
}

/** Where a deleted thing goes. Inside the app's own data dir, so it works the
 *  same on every platform and needs no `osascript`/`gio` spawn.
 *
 *  ponytail: the app's own trash, not the OS one — so Finder's "Put Back"
 *  doesn't apply and nothing empties it. Move to a real OS trash if someone
 *  asks; it needs a per-platform spawn that can be absent, which is exactly
 *  what this avoids. */
function trashDir(): string {
  return dataPath("trash")
}

/**
 * Create a file or folder inside a company.
 *
 * The commit is what makes this undoable, and it is best-effort on purpose
 * (v61): `.mcp.json` and friends are commonly gitignored, and a company
 * registered from an existing directory may not be a repo at all — neither is
 * a reason to refuse to create a file.
 */
export async function createEntryImpl(
  parentPath: string,
  name: string,
  kind: "file" | "folder",
  execFn?: ExecFileFn
): Promise<FileOpResult> {
  const bad = nameProblem(name)
  if (bad) return { ok: false, message: bad }
  const trimmed = name.trim()

  const guard = await resolveWithinAgentRoot(parentPath)
  if (!guard) return { ok: false, message: "That folder isn't inside a company Alacrán manages." }
  if (!(await isDirectory(guard.realPath))) return { ok: false, message: "That isn't a folder." }

  const target = path.join(guard.realPath, trimmed)
  try {
    await stat(target)
    return { ok: false, message: `"${trimmed}" already exists here.` }
  } catch {
    // Not there — which is what we want.
  }

  try {
    if (kind === "folder") {
      await mkdir(target)
      // git tracks files, not directories, so a bare mkdir has nothing to
      // commit. Saying "created" and leaving no trace in history would be a
      // lie the next update quietly erases.
      await writeFile(path.join(target, ".gitkeep"), "", "utf-8")
    } else {
      await writeFile(target, "", { flag: "wx" })
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }

  const relative = path.relative(guard.agentRootPath, kind === "folder" ? path.join(target, ".gitkeep") : target)
  await commitFile(guard.agentRootPath, relative, `Create ${relative} via Alacrán`, execFn).catch(() => {})
  return { ok: true, message: `Created ${trimmed}`, path: target }
}

/**
 * Rename or move — one operation, because on a filesystem they are the same
 * one. `toRelativePath` is relative to the company root, so "rename in place"
 * and "put it in docs/decisions" are the same call with a different string.
 */
export async function moveEntryImpl(
  fromPath: string,
  toRelativePath: string,
  execFn?: ExecFileFn
): Promise<FileOpResult> {
  const guard = await resolveWithinAgentRoot(fromPath)
  if (!guard) return { ok: false, message: "That isn't inside a company Alacrán manages." }

  const cleaned = toRelativePath.trim().replace(/^\/+/, "")
  if (!cleaned) return { ok: false, message: "Give it a name." }
  if (cleaned.includes("\0")) return { ok: false, message: "That name isn't valid." }

  const target = path.resolve(guard.agentRootPath, cleaned)
  // The destination does not exist yet, so it cannot be realpath'd. Containment
  // is checked on the resolved string against the already-realpath'd root, and
  // the PARENT is guarded properly below — a symlinked parent pointing outside
  // is the case the string check alone would miss.
  if (target !== guard.agentRootPath && !target.startsWith(guard.agentRootPath + path.sep)) {
    return { ok: false, message: "That would move it outside the company folder." }
  }
  const parentGuard = await resolveWithinAgentRoot(path.dirname(target))
  if (!parentGuard || parentGuard.agentRootPath !== guard.agentRootPath) {
    return { ok: false, message: "That destination folder isn't inside this company." }
  }

  try {
    await stat(target)
    return { ok: false, message: "Something is already there." }
  } catch {
    /* free */
  }

  const fromRelative = path.relative(guard.agentRootPath, guard.realPath)
  try {
    await rename(guard.realPath, target)
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }

  // Both paths in one commit: `git add --` stages the removal of the old and
  // the addition of the new, so history shows a move rather than a delete and
  // an unrelated create.
  const toRelative = path.relative(guard.agentRootPath, target)
  await commitFile(guard.agentRootPath, [fromRelative, toRelative], `Move ${fromRelative} to ${toRelative} via Alacrán`, execFn).catch(() => {})
  return { ok: true, message: `Moved to ${toRelative}`, path: target }
}

/**
 * Delete — which never unlinks.
 *
 * The thing is moved into the app's trash first, so it is recoverable whatever
 * happens next, and the removal is then committed best-effort so a tracked
 * file is also recoverable from its own History. Both, rather than choosing:
 * deciding which one applies costs a `git ls-files` spawn to answer a question
 * whose wrong answer destroys the user's work.
 */
export async function deleteEntryImpl(
  targetPath: string,
  execFn?: ExecFileFn,
  trashRoot: string = trashDir(),
  stamp: string = new Date().toISOString().replace(/[:.]/g, "-")
): Promise<FileOpResult> {
  const guard = await resolveWithinAgentRoot(targetPath)
  if (!guard) return { ok: false, message: "That isn't inside a company Alacrán manages." }
  if (guard.realPath === guard.agentRootPath) {
    return { ok: false, message: "That's the company's own folder. Remove the company instead." }
  }

  const relative = path.relative(guard.agentRootPath, guard.realPath)
  const bin = path.join(trashRoot, `${stamp}-${path.basename(guard.realPath)}`)
  try {
    await mkdir(trashRoot, { recursive: true })
    await rename(guard.realPath, bin)
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }

  await commitFile(guard.agentRootPath, relative, `Delete ${relative} via Alacrán`, execFn).catch(() => {})
  return { ok: true, message: `Deleted ${relative}`, path: bin }
}

/**
 * One directory's contents, for the "All files" view.
 *
 * One level, on demand, rather than a recursive walk: a company holds a git
 * repo and possibly a node_modules, and the only way a tree stays cheap is by
 * never reading a folder nobody opened.
 */
export async function listFolderImpl(dirPath: string): Promise<{ entries: FolderEntry[] } | { error: string }> {
  const guard = await resolveWithinAgentRoot(dirPath)
  if (!guard) return { error: "That folder isn't inside a company Alacrán manages." }

  let raw
  try {
    raw = await readdir(guard.realPath, { withFileTypes: true })
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const entries = raw
    .filter((e) => !HIDDEN.has(e.name))
    .map((e) => ({
      name: e.name,
      path: path.join(guard.realPath, e.name),
      kind: e.isDirectory() ? ("folder" as const) : ("file" as const),
    }))
    // Folders first, then by name — the order every file manager uses, and the
    // one that keeps a long list scannable.
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1))

  return { entries }
}
