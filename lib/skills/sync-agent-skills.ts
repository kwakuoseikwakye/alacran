import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * One source of truth for a company's commands, a generated copy for each agent
 * that does not read it.
 *
 * `.agents/skills/<name>/SKILL.md` is the folder Codex, Kimi and Antigravity read
 * natively. Claude Code reads `.claude/skills` and Kiro reads `.kiro/skills`, so
 * those get byte copies (with a one-line marker), recorded in a manifest by hash.
 * The manifest is what tells a copy this module made from a file somebody wrote:
 * a folder that is not in it, or whose hash no longer matches, is never
 * overwritten or deleted — it is reported as a conflict and left exactly as found.
 *
 * Copies, not symlinks: they survive `git clone` and zip downloads on every OS.
 * Plain file work only: no git, no network, and safe to call often (a second run
 * writes nothing).
 */
export const CANONICAL_SKILLS_DIR = ".agents/skills"
export const MIRROR_DIRS = [".claude/skills", ".kiro/skills"] as const
export const MIRROR_MANIFEST = ".agents/mirror.json"

export type SyncConflict = { path: string; reason: "not-generated" | "edited" | "outside-company" }
export type SyncReport = { written: string[]; removed: string[]; conflicts: SyncConflict[]; unchanged: number }

type Tree = Map<string, { data: Buffer; mode: number }>
type Manifest = { version: 1; skills: Record<string, { mirrors: Record<string, string> }> }

/** A skill's folder name becomes a path segment, so nothing that can climb or hide is accepted. */
const SAFE_NAME = /^[^./\\][^/\\]*$/
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/

async function readTree(dir: string, prefix = "", into: Tree = new Map()): Promise<Tree> {
  for (const entry of await readdir(path.join(dir, ...(prefix ? prefix.split("/") : [])), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    // Symlinks are neither followed nor copied: a skill folder is data, not a way out of itself.
    if (entry.isDirectory()) await readTree(dir, rel, into)
    else if (entry.isFile()) {
      const abs = path.join(dir, ...rel.split("/"))
      into.set(rel, { data: await readFile(abs), mode: (await stat(abs)).mode & 0o777 })
    }
  }
  return into
}

function hashTree(tree: Tree): string {
  const hash = createHash("sha256")
  for (const rel of [...tree.keys()].sort()) {
    hash.update(`${rel}\0${tree.get(rel)!.data.length}\0`)
    hash.update(tree.get(rel)!.data)
  }
  return hash.digest("hex")
}

async function hashIfExists(dir: string): Promise<string | null> {
  try {
    return hashTree(await readTree(dir))
  } catch {
    return null
  }
}

/** The hash of a whole skill folder (every file, not just SKILL.md), or null when it cannot be read. */
export const hashSkillDir = hashIfExists

/**
 * Whether `rel` (a folder under the company) really lives outside it, because it or one of its
 * parents is a link to somewhere else. People do link one shared commands folder into many repos;
 * writing or deleting through such a link would change every repo that shares it.
 */
export async function escapesRoot(root: string, rel: string): Promise<boolean> {
  let realRoot: string
  try {
    realRoot = await realpath(root)
  } catch {
    return false
  }
  let probe = path.join(root, ...rel.split("/"))
  for (;;) {
    try {
      const real = await realpath(probe)
      return real !== realRoot && !real.startsWith(realRoot + path.sep)
    } catch {
      const parent = path.dirname(probe)
      if (parent === probe) return true
      probe = parent
    }
  }
}

async function writeTree(dir: string, tree: Tree): Promise<void> {
  for (const [rel, { data, mode }] of tree) {
    const file = path.join(dir, ...rel.split("/"))
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data, { mode })
  }
}

function withMarker(name: string, skillMd: Buffer): Buffer {
  const text = skillMd.toString("utf-8")
  const marker = `<!-- generated from ${CANONICAL_SKILLS_DIR}/${name}: edit there, not here -->\n`
  const at = FRONTMATTER.exec(text)?.[0].length ?? 0
  return Buffer.from(text.slice(0, at) + marker + text.slice(at), "utf-8")
}

async function readManifest(root: string): Promise<Manifest> {
  try {
    const raw = JSON.parse(await readFile(path.join(root, MIRROR_MANIFEST), "utf-8"))
    if (raw && raw.version === 1 && raw.skills && typeof raw.skills === "object") return raw as Manifest
  } catch {
    // Missing or corrupt: treated as "we generated nothing yet", which only ever makes the sync more careful.
  }
  return { version: 1, skills: {} }
}

const mirrorsOf = (entry: unknown): Record<string, string> => {
  const mirrors = (entry as { mirrors?: unknown } | null)?.mirrors
  return mirrors && typeof mirrors === "object" ? (mirrors as Record<string, string>) : {}
}
const isMirrorDir = (dir: string) => (MIRROR_DIRS as readonly string[]).includes(dir)

/**
 * Which skill folders in each mirror this module generated AND nobody has edited since (for hiding
 * them from lists). A copy someone edited is a different skill now: hiding it would make the
 * divergence invisible, so it is left out here and the lists show it beside the shared one.
 */
export async function readGeneratedMirrors(root: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  for (const [name, entry] of Object.entries((await readManifest(root)).skills)) {
    if (!SAFE_NAME.test(name)) continue
    for (const [mirror, recorded] of Object.entries(mirrorsOf(entry))) {
      if (!isMirrorDir(mirror)) continue
      if ((await hashIfExists(path.join(root, ...mirror.split("/"), name))) !== recorded) continue
      if (!out.has(mirror)) out.set(mirror, new Set())
      out.get(mirror)!.add(name)
    }
  }
  return out
}

async function listSkillNames(sourceRoot: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(sourceRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const names: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !SAFE_NAME.test(entry.name)) continue
    try {
      await stat(path.join(sourceRoot, entry.name, "SKILL.md"))
      names.push(entry.name)
    } catch {
      // Not a skill folder.
    }
  }
  return names.sort()
}

export async function syncAgentSkills(root: string): Promise<SyncReport> {
  const report: SyncReport = { written: [], removed: [], conflicts: [], unchanged: 0 }
  const sourceRoot = path.join(root, CANONICAL_SKILLS_DIR)
  // A shared folder that is a link to somewhere else is not this company's to copy from or manage.
  if (await escapesRoot(root, CANONICAL_SKILLS_DIR)) {
    report.conflicts.push({ path: CANONICAL_SKILLS_DIR, reason: "outside-company" })
    return report
  }
  const names = await listSkillNames(sourceRoot)
  const manifest = await readManifest(root)
  const next: Manifest = { version: 1, skills: {} }
  // A mirror folder that links outside the company is never written to or deleted from.
  const blocked = new Set<string>()
  for (const mirror of MIRROR_DIRS) {
    if (await escapesRoot(root, mirror)) {
      blocked.add(mirror)
      report.conflicts.push({ path: mirror, reason: "outside-company" })
    }
  }

  for (const name of names) {
    const source = await readTree(path.join(sourceRoot, name))
    const built: Tree = new Map(source)
    const skillMd = source.get("SKILL.md")!
    built.set("SKILL.md", { data: withMarker(name, skillMd.data), mode: skillMd.mode })
    const builtHash = hashTree(built)
    const mirrors: Record<string, string> = {}

    for (const mirror of MIRROR_DIRS) {
      if (blocked.has(mirror)) continue
      const rel = `${mirror}/${name}`
      const target = path.join(root, ...rel.split("/"))
      const recorded = mirrorsOf(manifest.skills[name])[mirror]
      const current = await hashIfExists(target)

      if (current === null) {
        await writeTree(target, built)
        report.written.push(rel)
        mirrors[mirror] = builtHash
      } else if (current === builtHash) {
        report.unchanged++
        mirrors[mirror] = builtHash
      } else if (recorded === undefined) {
        report.conflicts.push({ path: rel, reason: "not-generated" })
      } else if (recorded !== current) {
        report.conflicts.push({ path: rel, reason: "edited" })
        mirrors[mirror] = recorded
      } else {
        await rm(target, { recursive: true, force: true })
        await writeTree(target, built)
        report.written.push(rel)
        mirrors[mirror] = builtHash
      }
    }
    if (Object.keys(mirrors).length) next.skills[name] = { mirrors }
  }

  // Skills whose shared source is gone: take their generated copies with them, but only untouched ones.
  for (const [name, entry] of Object.entries(manifest.skills).sort(([a], [b]) => a.localeCompare(b))) {
    if (names.includes(name) || !SAFE_NAME.test(name)) continue
    for (const [mirror, recorded] of Object.entries(mirrorsOf(entry))) {
      if (!isMirrorDir(mirror) || blocked.has(mirror)) continue
      const rel = `${mirror}/${name}`
      const target = path.join(root, ...rel.split("/"))
      const current = await hashIfExists(target)
      if (current === null) continue
      if (current === recorded) {
        await rm(target, { recursive: true, force: true })
        report.removed.push(rel)
      } else {
        report.conflicts.push({ path: rel, reason: "edited" })
      }
    }
  }

  const existing = await readFile(path.join(root, MIRROR_MANIFEST), "utf-8").catch(() => null)
  if (existing !== null || Object.keys(next.skills).length > 0) {
    const text = `${JSON.stringify(next, null, 2)}\n`
    if (text !== existing) {
      await mkdir(path.dirname(path.join(root, MIRROR_MANIFEST)), { recursive: true })
      await writeFile(path.join(root, MIRROR_MANIFEST), text)
      report.written.push(MIRROR_MANIFEST)
    }
  }
  return report
}
