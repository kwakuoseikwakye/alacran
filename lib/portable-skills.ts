import { cp, mkdir, readFile, readdir, rm, rmdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { defaultExecFile } from "./default-exec-file"
import { getEffectiveAgents } from "./get-effective-agents"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { pathExists } from "./path-exists"
import { isAppManagedSkillPath } from "./vendored-skills"
import {
  CANONICAL_SKILLS_DIR,
  MIRROR_MANIFEST,
  escapesRoot,
  hashSkillDir,
  readGeneratedMirrors,
  syncAgentSkills,
} from "./skills/sync-agent-skills"
import type { SyncReport } from "./skills/sync-agent-skills"

/**
 * Move a company's commands to the folder every agent can read.
 *
 * Companies scaffolded so far keep their commands as flat files in
 * `.claude/commands`, a folder only Claude Code reads. This copies each into
 * `.agents/skills/<name>/SKILL.md` (Codex, Kimi and Antigravity read that), lets
 * `syncAgentSkills` generate the Claude Code and Kiro folders from it, and only
 * then deletes the old files. Same shape as `portable-agent-file.ts`, which did
 * this for CLAUDE.md: one explicit click, one commit, git is the undo.
 *
 * Left where they are, and reported: skills the app installed and keeps up to
 * date (vendored packs, replaced wholesale on update, so a moved copy would be
 * orphaned), `daily-team-log` (its own text points at its .claude path), and any
 * folder that is a link to somewhere outside the company (a commands folder
 * shared across repos: deleting through it would change every repo that uses it).
 * Until the shipped packs move too, vendored skills stay Claude Code and Kiro only.
 */

const LEGACY_COMMANDS = ".claude/commands"
const LEGACY_SKILLS = ".claude/skills"
const LEAVE_IN_PLACE = new Set(["daily-team-log"])
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * A command file becomes a skill file. A skill needs a name and a description;
 * a command that already has both is returned untouched.
 */
export function commandToSkillMarkdown(name: string, raw: string): string {
  const match = FRONTMATTER.exec(raw)
  const body = match ? raw.slice(match[0].length) : raw
  const fields = match ? match[1] : ""
  const has = (key: string) => new RegExp(`^${key}:`, "m").test(fields)
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim()
  const added: string[] = []
  if (!has("name")) added.push(`name: ${name}`)
  if (!has("description")) added.push(`description: ${JSON.stringify(heading ? heading.slice(0, 160) : `The ${name} command`)}`)
  if (!match) return `---\n${added.join("\n")}\n---\n\n${raw}`
  return added.length ? `---\n${added.join("\n")}\n${fields}\n---\n${body}` : raw
}

export type PortablePlan = {
  copyCommands: string[]
  copySkills: string[]
  removeLegacy: string[]
  clashes: string[]
  leftInPlace: string[]
}

/** The flat command names a company holds, or none when that folder is a link to somewhere outside it. */
async function flatCommandNames(rootPath: string): Promise<string[]> {
  if (await escapesRoot(rootPath, LEGACY_COMMANDS)) return []
  const files = await readdir(path.join(rootPath, ...LEGACY_COMMANDS.split("/"))).catch(() => [] as string[])
  return files.filter((file) => file.endsWith(".md")).map((file) => file.slice(0, -3)).sort()
}

export async function planPortableSkills(rootPath: string, packsRoot: string): Promise<PortablePlan> {
  const plan: PortablePlan = { copyCommands: [], copySkills: [], removeLegacy: [], clashes: [], leftInPlace: [] }
  const sharedDir = (name: string) => path.join(rootPath, ...CANONICAL_SKILLS_DIR.split("/"), name)
  const shared = async (name: string) => readFile(path.join(sharedDir(name), "SKILL.md"), "utf-8").catch(() => null)
  const taken = new Set<string>()

  if (await escapesRoot(rootPath, LEGACY_COMMANDS)) plan.leftInPlace.push(LEGACY_COMMANDS)
  for (const name of await flatCommandNames(rootPath)) {
    const file = `${name}.md`
    const wanted = commandToSkillMarkdown(name, await readFile(path.join(rootPath, ...LEGACY_COMMANDS.split("/"), file), "utf-8"))
    const existing = await shared(name)
    if (existing === null) {
      plan.copyCommands.push(name)
      plan.removeLegacy.push(`${LEGACY_COMMANDS}/${file}`)
      taken.add(name)
    } else if (existing === wanted) {
      plan.removeLegacy.push(`${LEGACY_COMMANDS}/${file}`)
    } else {
      plan.clashes.push(name)
    }
  }

  if (await escapesRoot(rootPath, LEGACY_SKILLS)) {
    plan.leftInPlace.push(LEGACY_SKILLS)
    return plan
  }
  const generated = (await readGeneratedMirrors(rootPath)).get(LEGACY_SKILLS) ?? new Set<string>()
  const skillDirs = (
    await readdir(path.join(rootPath, ...LEGACY_SKILLS.split("/")), { withFileTypes: true }).catch(() => [])
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  for (const name of skillDirs) {
    // Our own, unedited generated copy of a shared skill: nothing to move.
    if (generated.has(name)) continue
    const legacyDir = path.join(rootPath, ...LEGACY_SKILLS.split("/"), name)
    if (!(await pathExists(path.join(legacyDir, "SKILL.md")))) continue
    if (LEAVE_IN_PLACE.has(name) || (await isAppManagedSkillPath(rootPath, path.join(legacyDir, "SKILL.md"), packsRoot))) {
      plan.leftInPlace.push(name)
      continue
    }
    if (taken.has(name)) {
      plan.clashes.push(name)
      continue
    }
    if ((await shared(name)) === null) {
      plan.copySkills.push(name)
      plan.removeLegacy.push(`${LEGACY_SKILLS}/${name}`)
      continue
    }
    // Already moved only if the WHOLE folder matches: a copy that stopped after SKILL.md must not get
    // the original's other files deleted.
    const sharedHash = await hashSkillDir(sharedDir(name))
    if (sharedHash !== null && sharedHash === (await hashSkillDir(legacyDir))) plan.removeLegacy.push(`${LEGACY_SKILLS}/${name}`)
    else plan.clashes.push(name)
  }
  return plan
}

const hasWork = (plan: PortablePlan) => plan.copyCommands.length + plan.copySkills.length + plan.removeLegacy.length > 0

/**
 * Cheap enough for the card render path. A flat command with no shared counterpart answers it without
 * looking further; otherwise the full plan decides, so a command that only clashes never offers a
 * button that then has nothing to do.
 */
export async function needsPortableSkills(rootPath: string, packsRoot: string): Promise<boolean> {
  for (const name of await flatCommandNames(rootPath)) {
    if (!(await pathExists(path.join(rootPath, ...CANONICAL_SKILLS_DIR.split("/"), name, "SKILL.md")))) return true
  }
  return hasWork(await planPortableSkills(rootPath, packsRoot))
}

/** What the move would do, for the dialog to show before anyone agrees to it. Writes nothing. */
export async function previewPortableSkillsImpl(
  agentId: string,
  packsRoot: string
): Promise<{ ok: true; move: string[]; keep: string[] } | { ok: false; message: string }> {
  const agent = (await getEffectiveAgents()).find((candidate) => candidate.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }
  if (agent.kind !== "command-set") return { ok: false, message: "This kind of folder has no commands to move" }
  const plan = await planPortableSkills(agent.rootPath, packsRoot)
  return { ok: true, move: [...plan.copyCommands, ...plan.copySkills], keep: [...plan.leftInPlace, ...plan.clashes] }
}

/**
 * The paths git will accept in one commit. A removed path only counts if git was tracking it (adding a
 * path git never saw is an error that would fail the whole commit), and an existing path is dropped when
 * the repo ignores it (same error). Anything git cannot answer leaves the path in.
 */
export async function committablePaths(root: string, paths: string[], execFn: ExecFileFn): Promise<string[]> {
  const git = (args: string[]) => execFn("git", ["-C", root, ...args])
  const lines = (out: { stdout: string }) => out.stdout.split("\n").map((line) => line.trim()).filter(Boolean)
  const tracked = lines(await git(["ls-files", "--", ...paths]).catch(() => ({ stdout: "" })))
  const ignored = new Set(lines(await git(["check-ignore", "--", ...paths]).catch(() => ({ stdout: "" }))))
  const isTracked = (rel: string) => tracked.some((file) => file === rel || file.startsWith(`${rel}/`))
  const out: string[] = []
  for (const rel of paths) {
    const onDisk = await pathExists(path.join(root, ...rel.split("/")))
    if (onDisk ? ignored.has(rel) && !isTracked(rel) : !isTracked(rel)) continue
    out.push(rel)
  }
  return out
}

/**
 * The portable-company counterpart of `copyNew` for commands: each flat pack command becomes a shared
 * skill, then the Claude Code and Kiro copies are generated. Same never-overwrite rule — a name the
 * company already holds, as a shared skill or still as a flat file, is theirs.
 */
export async function addCommandsAsSharedSkills(
  packCommandsDir: string,
  root: string
): Promise<{ added: string[]; written: string[] }> {
  const shared = path.join(root, ...CANONICAL_SKILLS_DIR.split("/"))
  const added: string[] = []
  const written: string[] = []
  for (const file of (await readdir(packCommandsDir).catch(() => [] as string[])).filter((f) => f.endsWith(".md"))) {
    const name = file.slice(0, -3)
    if ((await pathExists(path.join(shared, name))) || (await pathExists(path.join(root, ...LEGACY_COMMANDS.split("/"), file)))) continue
    await mkdir(path.join(shared, name), { recursive: true })
    await writeFile(
      path.join(shared, name, "SKILL.md"),
      commandToSkillMarkdown(name, await readFile(path.join(packCommandsDir, file), "utf-8")),
      "utf-8"
    )
    added.push(file)
    written.push(`${CANONICAL_SKILLS_DIR}/${name}`)
  }
  if (added.length > 0) {
    // A failed sync leaves the shared skills in place, which is what every agent but two reads.
    const report = await syncAgentSkills(root).catch(() => null)
    written.push(...(report?.written ?? []))
  }
  return { added, written }
}

export type MoveResult =
  | { ok: true; report: SyncReport; removedCommands: string[]; stuck: string[]; skillPaths: string[] }
  | { ok: false; message: string }

/**
 * The write half of the move, with no git: copy what the plan lists into `.agents/skills`, prove every
 * copy exists, generate the Claude Code and Kiro folders, and only then remove the old files. Shared by
 * the button (which commits afterwards) and the scaffold (whose first commit picks it up), so the two
 * cannot disagree about what "moved" means.
 */
export async function movePortableSkills(root: string, plan: PortablePlan): Promise<MoveResult> {
  // A legacy skill folder sits at the very path its generated copy will occupy, so it has to go before
  // the sync. Flat commands wait until the copies are proven to exist.
  const skillPaths = plan.removeLegacy.filter((rel) => rel.startsWith(`${LEGACY_SKILLS}/`))
  const commandPaths = plan.removeLegacy.filter((rel) => !rel.startsWith(`${LEGACY_SKILLS}/`))

  const shared = path.join(root, ...CANONICAL_SKILLS_DIR.split("/"))
  try {
    for (const name of plan.copyCommands) {
      const raw = await readFile(path.join(root, ...LEGACY_COMMANDS.split("/"), `${name}.md`), "utf-8")
      await mkdir(path.join(shared, name), { recursive: true })
      await writeFile(path.join(shared, name, "SKILL.md"), commandToSkillMarkdown(name, raw), "utf-8")
    }
    for (const name of plan.copySkills) {
      await cp(path.join(root, ...LEGACY_SKILLS.split("/"), name), path.join(shared, name), { recursive: true })
    }
    // Prove every new shared file exists before a single old one is removed.
    for (const name of [...plan.copyCommands, ...plan.copySkills]) await stat(path.join(shared, name, "SKILL.md"))
    for (const rel of skillPaths) await rm(path.join(root, ...rel.split("/")), { recursive: true, force: true })
  } catch (err) {
    return { ok: false, message: `Couldn't move the commands: ${err instanceof Error ? err.message : String(err)}` }
  }

  let report
  try {
    report = await syncAgentSkills(root)
  } catch (err) {
    return { ok: false, message: `Moved the commands but couldn't generate the other folders: ${err instanceof Error ? err.message : String(err)}` }
  }

  // A flat command is removed only once Claude Code's own copy of it exists; otherwise it stays, so the
  // move can never leave Claude Code without a command it had.
  const removedCommands: string[] = []
  const stuck: string[] = []
  for (const rel of commandPaths) {
    const name = path.basename(rel, ".md")
    if (await pathExists(path.join(root, ...LEGACY_SKILLS.split("/"), name, "SKILL.md"))) {
      await rm(path.join(root, ...rel.split("/")), { force: true })
      removedCommands.push(rel)
    } else {
      stuck.push(name)
    }
  }
  // Leave no empty folder behind. rmdir refuses a folder that still holds something, which is the point.
  if (removedCommands.length > 0) await rmdir(path.join(root, ...LEGACY_COMMANDS.split("/"))).catch(() => undefined)
  return { ok: true, report, removedCommands, stuck, skillPaths }
}

export async function addPortableSkillsImpl(
  agentId: string,
  packsRoot: string,
  execFn: ExecFileFn = defaultExecFile
): Promise<{ ok: true; moved: number; kept: string[]; conflicts: string[]; committed: boolean } | { ok: false; message: string }> {
  const agent = (await getEffectiveAgents()).find((candidate) => candidate.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }
  // Same gate as every other company feature: an `external` folder is someone else's project.
  if (agent.kind !== "command-set") return { ok: false, message: "This kind of folder has no commands to move" }

  const root = agent.rootPath
  if (await escapesRoot(root, CANONICAL_SKILLS_DIR)) {
    return { ok: false, message: "This company's .agents/skills is a link to another folder, so nothing was moved" }
  }
  const plan = await planPortableSkills(root, packsRoot)
  if (!hasWork(plan)) return { ok: false, message: "There is nothing to move in this company" }

  const moved = await movePortableSkills(root, plan)
  if (!moved.ok) return moved
  const { report, removedCommands, stuck, skillPaths } = moved

  // One commit, pathspec-scoped to exactly what changed. A failed or impossible commit is not a failed
  // move: the files are right on disk, which is what every reader uses. It is reported, not hidden.
  let committed = false
  try {
    const paths = await committablePaths(
      root,
      [...new Set([CANONICAL_SKILLS_DIR, MIRROR_MANIFEST, ...skillPaths, ...removedCommands, ...report.written])],
      execFn
    )
    if (paths.length > 0) {
      await commitFile(root, paths, "Move commands to .agents/skills so every AI can run them", execFn)
      committed = true
    }
  } catch {
    // Reported through `committed: false`.
  }
  return {
    ok: true,
    moved: plan.copyCommands.length + plan.copySkills.length,
    kept: [...plan.leftInPlace, ...plan.clashes, ...stuck],
    conflicts: report.conflicts.map((conflict) => conflict.path),
    committed,
  }
}
