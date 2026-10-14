import fs from "node:fs/promises"
import fsSync from "node:fs"
import path from "node:path"
import yaml from "yaml"
import { commitFile, gitCommit, type ExecFileFn } from "@/lib/git-commit-file"
import { defaultExecFile } from "@/lib/default-exec-file"
import { AGENTS_REL, refreshGuide, type GuideRefresh } from "@/lib/guide/refresh"
import { DEFINITIONS_REL, readDefinitions, revisionOf } from "./definitions"
import { contained, dirtyPaths, trackedUnder, withFileLock } from "./safety"
import { APP_OWNED_SLUGS, BUILT_IN_SLUGS, SLUG_PATTERN, pickSlug, slugify, validateFields } from "./rules"

export type FailureCode = "invalid" | "exists" | "folder-exists" | "folder-case" | "not-found" | "conflict" | "malformed" | "unsafe" | "dirty" | "stale" | "failed"
export type Failure = { ok: false; code: FailureCode; error: string }
export type Saved = { ok: true; slug: string; committed: boolean; commitError?: string; commitPaths: string[]; commitMessage: string; guide?: GuideRefresh }
export type Deps = { exec: ExecFileFn; rename: typeof fs.rename; now: () => Date }
export const realDeps: Deps = { exec: defaultExecFile, rename: fs.rename, now: () => new Date() }

export const fail = (code: FailureCode, error: string): Failure => ({ ok: false, code, error })
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** One lock per company: every department write waits its turn, so a second create reads the first's file. */
export const lockKey = (root: string) => path.join(root, DEFINITIONS_REL)

const defsFile = (root: string) => path.join(root, DEFINITIONS_REL)

function currentRevision(root: string): string {
  try {
    return revisionOf(fsSync.readFileSync(defsFile(root), "utf8"))
  } catch {
    return "absent"
  }
}

/** Replace definitions/departments.yaml iff it still has the revision we read. Temp file + rename, so a reader never sees half a file. */
export async function replaceDefinitions(root: string, expectedRevision: string, nextText: string, deps: Deps): Promise<Failure | null> {
  if (!(await contained(root, defsFile(root)))) return fail("unsafe", "definitions/ points outside this company, so nothing was changed.")
  if (currentRevision(root) !== expectedRevision) {
    return fail("conflict", "definitions/departments.yaml changed while you were working. Reload and try again.")
  }
  await fs.mkdir(path.dirname(defsFile(root)), { recursive: true })
  // ponytail: a few-ms window between the revision re-check above and the rename; a hand edit landing in it is overwritten. Upgrade path: an advisory lockfile.
  const tmp = `${defsFile(root)}.${process.pid}.tmp`
  let renamed = false
  try {
    await fs.writeFile(tmp, nextText, { encoding: "utf8", flag: "wx" })
    await deps.rename(tmp, defsFile(root))
    renamed = true
  } finally {
    if (!renamed) await fs.rm(tmp, { force: true }).catch(() => {})
  }
  return null
}

export async function commit(root: string, slug: string, paths: string[], commitMessage: string, deps: Deps): Promise<Saved> {
  try {
    await commitFile(root, paths, commitMessage, deps.exec)
    return { ok: true, slug, committed: true, commitPaths: paths, commitMessage }
  } catch (err) {
    return { ok: true, slug, committed: false, commitError: `Saved locally; history update failed: ${message(err)}`, commitPaths: paths, commitMessage }
  }
}

/** After the primary write succeeded: refresh the guide (never throws) and return the commit paths including AGENTS.md when it changed. */
async function withGuide(root: string, paths: string[], deps: Deps): Promise<{ paths: string[]; guide: GuideRefresh }> {
  const guide = await refreshGuide(root, { exec: deps.exec })
  return { paths: guide.status === "updated" ? [...paths, AGENTS_REL] : paths, guide }
}

const FILE_NAME = /^(?:\.gitkeep|[A-Za-z0-9][A-Za-z0-9._-]*)$/ // .gitkeep is the placeholder create writes
function allowedRetryPath(p: string): boolean {
  if (p === DEFINITIONS_REL || p === AGENTS_REL) return true
  const parts = p.split("/")
  if (parts[0] !== "records") return false
  if (parts.length === 3 && parts[1] === ".archive") return SLUG_PATTERN.test(parts[2])
  if (parts.length < 2 || parts.length > 3 || !SLUG_PATTERN.test(parts[1])) return false
  if ((BUILT_IN_SLUGS as readonly string[]).includes(parts[1]) || (APP_OWNED_SLUGS as readonly string[]).includes(parts[1])) return false
  return parts.length === 2 || (FILE_NAME.test(parts[2]) && !parts[2].includes(".."))
}

/** Retry only the commit of work that is already on disk. Paths must stay inside definitions/ or records/. */
export async function retryCommit(root: string, paths: string[], commitMessage: string, deps: Deps = realDeps): Promise<{ ok: true } | Failure> {
  if (!paths.length || !paths.every(allowedRetryPath)) {
    return fail("invalid", "Those paths can't be committed from here.")
  }
  try {
    const specs = paths.map((p) => `:(literal)${p}`)
    for (const p of paths) {
      const spec = `:(literal)${p}`
      let st: fsSync.Stats | null = null
      try {
        st = await fs.lstat(path.join(root, p))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
      }
      // Gone from disk: -A can only stage a deletion. On disk: a removed source folder coming back is new work, never ours to commit.
      if (!st) {
        // Only if the index still lists it; if the first attempt already staged the deletion there is nothing to add.
        const { stdout } = await deps.exec("git", ["-C", root, "ls-files", "--", spec])
        if (stdout.trim()) await deps.exec("git", ["-C", root, "add", "-A", "--", spec])
      }
      else if ((st.isDirectory() && !p.startsWith("records/.archive/")) || (p.split("/").length === 2 && p !== DEFINITIONS_REL)) return fail("dirty", "That folder changed since the removal; review it and try again.")
      else await deps.exec("git", ["-C", root, "add", "--", spec])
    }
    await gitCommit(root, ["commit", "-m", commitMessage, "--", ...specs], deps.exec)
    return { ok: true }
  } catch (err) {
    return fail("failed", `History update failed again: ${message(err)}`)
  }
}

/** Lower-cased visible folder names under records/ → their real names. */
export async function visibleFolders(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  try {
    for (const e of await fs.readdir(path.join(root, "records"), { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith(".")) out.set(e.name.toLowerCase(), e.name)
    }
  } catch {
    /* no records/ yet */
  }
  return out
}

function withEntry(text: string | null, entry: { slug: string; name: string; purpose: string; color: string }): string {
  const doc = text && text.trim() ? yaml.parseDocument(text) : new yaml.Document({})
  if (!yaml.isSeq(doc.get("departments"))) doc.set("departments", doc.createNode([]))
  doc.addIn(["departments"], doc.createNode(entry))
  return doc.toString({ lineWidth: 0 })
}

function withEdit(text: string, slug: string, patch: { name: string; purpose: string; color: string }): string | null {
  const doc = yaml.parseDocument(text)
  const seq = doc.get("departments", true)
  if (!yaml.isSeq(seq)) return null
  const item = seq.items.find((i) => yaml.isMap(i) && i.get("slug") === slug)
  if (!yaml.isMap(item)) return null
  for (const [k, v] of Object.entries(patch)) item.set(k, v)
  return doc.toString({ lineWidth: 0 })
}

const recent = new Map<string, Saved>()
const REMEMBER = 200

export function createDepartment(
  root: string,
  input: { name: string; purpose: string; color: string; adopt?: boolean; operationId?: string },
  deps: Deps = realDeps
): Promise<Saved | Failure> {
  return withFileLock(lockKey(root), async () => {
    const opKey = input.operationId ? `${path.resolve(root)}\0${input.operationId}` : null
    // Only a replay of the same request is answered from memory: the same id with a different name is a new request.
    const wanted = slugify(typeof input.name === "string" ? input.name : "")
    const seen = opKey ? recent.get(opKey) : undefined
    if (seen && seen.slug === wanted) return seen
    try {
      const result = await create(root, input, deps)
      if (opKey && result.ok) {
        recent.set(opKey, result)
        if (recent.size > REMEMBER) recent.delete(recent.keys().next().value!)
      }
      return result
    } catch (err) {
      return fail("failed", `Couldn't create the department: ${message(err)}`)
    }
  })
}

async function create(root: string, input: { name: string; purpose: string; color: string; adopt?: boolean }, deps: Deps): Promise<Saved | Failure> {
  const v = validateFields(input)
  if (!v.ok) return fail("invalid", v.error)
  const { name, purpose, color } = v.value

  const defs = readDefinitions(root)
  if (!defs.ok) return fail("malformed", defs.error)
  const defined = new Set(defs.departments.map((d) => d.slug))
  const folders = await visibleFolders(root)
  const picked = pickSlug(name, new Set([...BUILT_IN_SLUGS, ...defined, ...folders.keys()]))
  if (typeof picked !== "string") return fail("invalid", picked.error)
  const slug = picked
  if (defined.has(slug)) return fail("exists", `There is already a department called ${name}.`)

  const realFolder = folders.get(slug)
  if (realFolder !== undefined && realFolder !== slug) {
    return fail("folder-case", `A folder called "${realFolder}" already exists with different capitalisation. Rename it to "${slug}" first.`)
  }
  const folderExists = realFolder !== undefined
  if (folderExists && !input.adopt) {
    return fail("folder-exists", `A records folder called "${slug}" already exists. You can adopt it: its records stay exactly as they are.`)
  }

  const folder = path.join(root, "records", slug)
  const keepRel = `records/${slug}/.gitkeep`
  if (!(await contained(root, folder)) || !(await contained(root, defsFile(root)))) {
    return fail("unsafe", "That folder points outside this company, so nothing was changed.")
  }
  const paths = folderExists ? [DEFINITIONS_REL] : [DEFINITIONS_REL, keepRel]
  const dirty = await dirtyPaths(root, paths, deps.exec)
  if (dirty.length) return fail("dirty", `${dirty[0].slice(3)} has changes that aren't saved to history yet. Save or discard them first.`)

  let madeFolder = false
  let wroteKeep = false
  try {
    if (!folderExists) {
      if ((await fs.mkdir(folder, { recursive: true })) === undefined) {
        return fail("folder-exists", `A records folder called "${slug}" already exists. Nothing was changed.`)
      }
      madeFolder = true
      await fs.writeFile(path.join(root, keepRel), "", { flag: "wx" })
      wroteKeep = true
    }
    const failure = await replaceDefinitions(root, defs.revision, withEntry(defs.text, { slug, name, purpose, color }), deps)
    if (failure) {
      await undoCreate(root, slug, madeFolder, wroteKeep)
      return failure
    }
  } catch (err) {
    await undoCreate(root, slug, madeFolder, wroteKeep)
    return fail("failed", `Couldn't create the department: ${message(err)}`)
  }
  const g = await withGuide(root, paths, deps)
  return { ...(await commit(root, slug, g.paths, `feat(departments): add ${name}`, deps)), guide: g.guide }
}

/** Remove only what this operation made, and only if it is still just our placeholder. */
async function undoCreate(root: string, slug: string, madeFolder: boolean, wroteKeep: boolean) {
  if (wroteKeep) await fs.rm(path.join(root, "records", slug, ".gitkeep"), { force: true }).catch(() => {})
  if (madeFolder) await fs.rmdir(path.join(root, "records", slug)).catch(() => {})
}

export function editDepartment(
  root: string,
  input: { slug: string; name: string; purpose: string; color: string; expectedRevision: string },
  deps: Deps = realDeps
): Promise<Saved | Failure> {
  return withFileLock(lockKey(root), async () => {
    try {
      const v = validateFields(input)
      if (!v.ok) return fail("invalid", v.error)
      const defs = readDefinitions(root)
      if (!defs.ok) return fail("malformed", defs.error)
      if (!defs.departments.some((d) => d.slug === input.slug) || defs.text === null) {
        return fail("not-found", "Only departments you created can be edited here.")
      }
      if (defs.revision !== input.expectedRevision) {
        return fail("conflict", "definitions/departments.yaml changed while you were working. Reload and try again.")
      }
      const dirty = await dirtyPaths(root, [DEFINITIONS_REL], deps.exec)
      if (dirty.length) return fail("dirty", `${DEFINITIONS_REL} has changes that aren't saved to history yet. Save or discard them first.`)
      const next = withEdit(defs.text, input.slug, v.value)
      if (next === null) return fail("not-found", "That department isn't in the definitions file.")
      const failure = await replaceDefinitions(root, input.expectedRevision, next, deps)
      if (failure) return failure
      const g = await withGuide(root, [DEFINITIONS_REL], deps)
      return { ...(await commit(root, input.slug, g.paths, `chore(departments): update ${v.value.name}`, deps)), guide: g.guide }
    } catch (err) {
      return fail("failed", `Couldn't save the change: ${message(err)}`)
    }
  })
}

const MAX_TITLE = 120
const MAX_BODY = 20000

// Filename date is local on purpose; `updated` in the frontmatter is UTC ISO.
const localDate = (d: Date) => new Intl.DateTimeFormat("en-CA").format(d) // YYYY-MM-DD

export function addRecord(
  root: string,
  input: { slug: string; title: string; body: string },
  deps: Deps = realDeps
): Promise<(Saved & { file: string }) | Failure> {
  return withFileLock(lockKey(root), async () => {
    try {
      const title = typeof input.title === "string" ? input.title.trim() : ""
      const body = typeof input.body === "string" ? input.body.trim() : ""
      if (!title) return fail("invalid", "Give the record a title.")
      if (title.length > MAX_TITLE || /[\u0000-\u001f\u007f]/.test(title)) return fail("invalid", `Keep the title to one line of ${MAX_TITLE} characters or fewer.`)
      if (body.length > MAX_BODY) return fail("invalid", `Keep the text under ${MAX_BODY} characters.`)
      const { slug } = input
      if (!SLUG_PATTERN.test(slug) || (BUILT_IN_SLUGS as readonly string[]).includes(slug) || (APP_OWNED_SLUGS as readonly string[]).includes(slug)) {
        return fail("invalid", "This department keeps its records on its own page.")
      }
      const folder = path.join(root, "records", slug)
      if (!(await contained(root, folder))) return fail("unsafe", "That folder points outside this company, so nothing was saved.")
      const stat = await fs.stat(folder).catch(() => null)
      if (!stat?.isDirectory()) return fail("not-found", "That department has no records folder yet.")

      const stamp = deps.now()
      const front = yaml.stringify({ title, updated: stamp.toISOString() })
      const content = `---\n${front}---\n\n${body}\n`
      const base = `${localDate(stamp)}-${slugify(title) || "record"}`
      for (let n = 1; n <= 100; n++) {
        const file = n === 1 ? `${base}.md` : `${base}-${n}.md`
        try {
          await fs.writeFile(path.join(folder, file), content, { flag: "wx" })
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "EEXIST") continue
          throw err
        }
        const saved = await commit(root, slug, [`records/${slug}/${file}`], `feat(departments): add record "${title}" to ${slug}`, deps)
        return { ...saved, file }
      }
      return fail("failed", "Too many records with that title today. Use a different title.")
    } catch (err) {
      return fail("failed", `Couldn't save the record: ${message(err)}`)
    }
  })
}

export type RemovalPlan = { kind: "empty" } | { kind: "populated"; fileCount: number; archiveTarget: string }

/** Counts non-directory entries without ever following a symlink. Empty = missing, or only a real top-level .gitkeep file. */
async function inspectFolder(folder: string): Promise<{ empty: boolean; fileCount: number }> {
  let top
  try {
    top = await fs.lstat(folder)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { empty: true, fileCount: 0 }
    throw err
  }
  if (!top.isDirectory()) return { empty: false, fileCount: 1 } // a symlinked department folder is one thing to archive
  let fileCount = 0
  let entries = 0
  let keep = false
  const walk = async (dir: string, depth: number) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (depth === 0) {
        entries++
        if (e.name === ".gitkeep" && e.isFile()) { keep = true; continue } // the placeholder is an entry, not a user file
      }
      if (e.isDirectory()) await walk(path.join(dir, e.name), depth + 1)
      else fileCount++
    }
  }
  await walk(folder, 0)
  return { empty: entries === 0 || (entries === 1 && keep), fileCount }
}

async function freeArchiveTarget(root: string, slug: string): Promise<string> {
  for (let n = 1; ; n++) {
    const rel = `records/.archive/${n === 1 ? slug : `${slug}-${n}`}`
    try {
      await fs.lstat(path.join(root, rel))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return rel
      throw err
    }
  }
}

async function plan(root: string, slug: string): Promise<{ ok: true; plan: RemovalPlan; revision: string } | Failure> {
  const defs = readDefinitions(root)
  if (!defs.ok) return fail("malformed", defs.error)
  if (!defs.departments.some((d) => d.slug === slug)) return fail("not-found", "Only departments you created can be removed here.")
  const folder = path.join(root, "records", slug)
  if (!(await contained(root, folder))) return fail("unsafe", "That folder points outside this company, so nothing was changed.")
  const found = await inspectFolder(folder)
  if (found.empty) return { ok: true, plan: { kind: "empty" }, revision: defs.revision }
  const archiveTarget = await freeArchiveTarget(root, slug)
  if (!(await contained(root, path.join(root, archiveTarget)))) return fail("unsafe", "The archive folder points outside this company, so nothing was changed.")
  return { ok: true, plan: { kind: "populated", fileCount: found.fileCount, archiveTarget }, revision: defs.revision }
}

export async function planRemoval(root: string, slug: string): Promise<{ ok: true; plan: RemovalPlan; revision: string } | Failure> {
  try {
    return await plan(root, slug)
  } catch (err) {
    return fail("failed", `Couldn't look at that department: ${message(err)}`)
  }
}

function withoutEntry(text: string, slug: string): string | null {
  const doc = yaml.parseDocument(text)
  const seq = doc.get("departments", true)
  if (!yaml.isSeq(seq)) return null
  const index = seq.items.findIndex((i) => yaml.isMap(i) && i.get("slug") === slug)
  if (index < 0) return null
  doc.deleteIn(["departments", index])
  return doc.toString({ lineWidth: 0 })
}

export function removeDepartment(
  root: string,
  input: { slug: string; expectedRevision: string; confirm: RemovalPlan },
  deps: Deps = realDeps
): Promise<Saved | Failure> {
  return withFileLock(lockKey(root), async () => {
    try {
      const now = await plan(root, input.slug)
      if (!now.ok) return now
      if (now.revision !== input.expectedRevision) {
        return fail("conflict", "definitions/departments.yaml changed while you were working. Reload and try again.")
      }
      const same =
        now.plan.kind === input.confirm.kind &&
        (now.plan.kind === "empty" || (input.confirm.kind === "populated" && now.plan.archiveTarget === input.confirm.archiveTarget && now.plan.fileCount === input.confirm.fileCount))
      if (!same) return fail("stale", "This department changed since you looked at it. Review what will happen and confirm again.")

      const defs = readDefinitions(root)
      if (!defs.ok || defs.text === null) return fail("malformed", defs.ok ? "Nothing to remove." : defs.error)
      const next = withoutEntry(defs.text, input.slug)
      if (next === null) return fail("not-found", "That department isn't in the definitions file.")

      const folderRel = `records/${input.slug}`
      const folder = path.join(root, folderRel)
      const target = now.plan.kind === "populated" ? now.plan.archiveTarget : null
      const touched = [DEFINITIONS_REL, folderRel, ...(target ? [target] : [])]
      const dirty = await dirtyPaths(root, touched, deps.exec)
      if (dirty.length) return fail("dirty", `${dirty[0].slice(3)} has changes that aren't saved to history yet. Save or discard them first.`)

      const wasTracked = await trackedUnder(root, folderRel, deps.exec)
      const commitPaths = [DEFINITIONS_REL, ...(wasTracked ? [folderRel] : []), ...(target ? [target] : [])]

      if (target) {
        await fs.mkdir(path.join(root, "records", ".archive"), { recursive: true })
        await deps.rename(folder, path.join(root, target))
        try {
          const failure = await replaceDefinitions(root, input.expectedRevision, next, deps)
          if (failure) throw new Error(failure.error)
        } catch (err) {
          // Put back exactly what this operation moved, and only if nothing has taken its place.
          if (!fsSync.existsSync(folder)) {
            try {
              await deps.rename(path.join(root, target), folder)
            } catch {
              return fail("failed", `Your records are safe in ${target}; the department was not removed from the list (${message(err)}).`)
            }
            return fail("failed", `Nothing was removed: ${message(err)}`)
          }
          return fail("failed", `Your records are safe in ${target}; the department was not removed from the list (${message(err)}).`)
        }
      } else {
        const hadFolder = fsSync.existsSync(folder)
        await fs.rm(path.join(folder, ".gitkeep"), { force: true })
        try {
          await fs.rmdir(folder)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOTEMPTY") {
            await fs.writeFile(path.join(folder, ".gitkeep"), "", { flag: "wx" }).catch(() => {})
            return fail("stale", "This department changed since you looked at it. Review what will happen and confirm again.")
          }
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err
        }
        try {
          const failure = await replaceDefinitions(root, input.expectedRevision, next, deps)
          if (failure) throw new Error(failure.error)
        } catch (err) {
          if (hadFolder) {
            await fs.mkdir(folder, { recursive: true }).catch(() => {})
            await fs.writeFile(path.join(folder, ".gitkeep"), "", { flag: "wx" }).catch(() => {})
          }
          return fail("failed", `Nothing was removed: ${message(err)}`)
        }
      }
      const g = await withGuide(root, commitPaths, deps)
      return { ...(await commit(root, input.slug, g.paths, `chore(departments): remove ${input.slug}${target ? ` (records archived to ${target})` : ""}`, deps)), guide: g.guide }
    } catch (err) {
      return fail("failed", `Couldn't remove the department: ${message(err)}`)
    }
  })
}
