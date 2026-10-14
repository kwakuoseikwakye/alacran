import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Agent } from "../adapters/types"
import { buildSharedSections, wrapSharedBlock } from "./shared-context"
import type { ShareLink } from "./model"

/**
 * Where a terminal assistant finds what other companies share with it, kept
 * current while it works.
 *
 * An assistant opened in the terminal gets the shared knowledge in its opening
 * message, which is a snapshot: the other company can change, and a string can be
 * added or cut, while the session is open. It runs in this company's folder with
 * no way to read another's, so the one thing it can do again later is read a file
 * here. `state/` is where this repo keeps generated output (AGENTS.md §3) and the
 * company template already ignores `state/*`; the exclude below covers a company
 * that predates that line.
 *
 * It is a derived view, never a copy anyone commits: rewritten whenever what is
 * shared changes, deleted when nothing is, and never taken for a file the person
 * wrote themselves (only a file carrying the marker is ever replaced or removed).
 */
export const SHARED_FILE = "state/shared-knowledge.md"
export const SHARED_FILE_MARKER = "<!-- alacran-shared-knowledge"

export type SharedFileResult = "written" | "removed" | "unchanged" | "skipped"

type Deps = {
  read?: (file: string) => Promise<string>
  write?: (file: string, text: string) => Promise<void>
  makeDir?: (dir: string) => Promise<void>
  remove?: (file: string) => Promise<void>
  /** `git rev-parse --git-path info/exclude`, run in the company's folder. */
  gitExcludePath?: (root: string) => Promise<string | null>
  /** Reads of the SOURCE companies' files, for building the sections. */
  sourceRead?: (file: string) => Promise<string>
  sourceDir?: (dir: string) => Promise<string[]>
  now?: () => Date
}

const defaultGitExcludePath = (root: string) =>
  new Promise<string | null>((resolve) => {
    execFile("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, timeout: 5_000 }, (error, stdout) => {
      resolve(error ? null : path.resolve(root, stdout.trim()))
    })
  })

/** Keeps the file out of the company's git without touching any committed file:
 *  `.git/info/exclude` is local to this clone. Best effort, never throws. */
async function ensureExcluded(root: string, read: NonNullable<Deps["read"]>, write: NonNullable<Deps["write"]>, makeDir: NonNullable<Deps["makeDir"]>, excludePath: NonNullable<Deps["gitExcludePath"]>) {
  try {
    const file = await excludePath(root)
    if (!file) return
    const current = await read(file).catch(() => "")
    if (current.split(/\r?\n/).includes(SHARED_FILE)) return
    await makeDir(path.dirname(file))
    await write(file, `${current}${current === "" || current.endsWith("\n") ? "" : "\n"}${SHARED_FILE}\n`)
  } catch {
    /* the template's own `state/*` ignore is the other half of this */
  }
}

/**
 * Brings `state/shared-knowledge.md` in line with what is shared with `company`
 * right now. Never throws: this runs on a timer and after every change to a
 * string, and a failure here must not turn into a failed share or a failed cut.
 */
export async function syncSharedKnowledgeFile(
  company: Agent,
  links: ShareLink[],
  agents: Agent[],
  deps: Deps = {}
): Promise<SharedFileResult> {
  const read = deps.read ?? ((file) => readFile(file, "utf-8"))
  const write = deps.write ?? ((file, text) => writeFile(file, text, "utf-8"))
  const makeDir = deps.makeDir ?? ((dir) => mkdir(dir, { recursive: true }).then(() => undefined))
  const remove = deps.remove ?? ((file) => rm(file, { force: true }))
  const target = path.join(company.rootPath, SHARED_FILE)
  try {
    const sections = await buildSharedSections(company.id, links, agents, deps.sourceRead, deps.sourceDir)
    const existing = await read(target).catch(() => null)
    const ours = existing !== null && existing.startsWith(SHARED_FILE_MARKER)

    if (!sections) {
      if (!ours) return "unchanged"
      await remove(target)
      return "removed"
    }
    // Somebody's own file under that name: leave it alone and say nothing.
    if (existing !== null && !ours) return "skipped"

    const hash = createHash("sha256").update(sections).digest("hex").slice(0, 16)
    if (ours && existing.split("\n", 1)[0].includes(`sha:${hash}`)) return "unchanged"

    const stamp = (deps.now?.() ?? new Date()).toISOString()
    const header = `${SHARED_FILE_MARKER} sha:${hash} written:${stamp} — rewritten by Alacrán whenever what other companies share changes. Do not edit. -->`
    await makeDir(path.dirname(target))
    await write(target, `${header}\n\n${wrapSharedBlock(sections, company.name)}\n`)
    await ensureExcluded(company.rootPath, read, write, makeDir, deps.gitExcludePath ?? defaultGitExcludePath)
    return "written"
  } catch {
    return "skipped"
  }
}
