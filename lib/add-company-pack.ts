import { readdir, cp, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { COMPANY_STARTER_PACKS } from "./company-starter-packs"
import {
  isPackInstalled,
  packSkillsSource,
  packStampName,
  SHARED_SKILLS_RELATIVE_DIR,
  VENDORED_SKILLS_RELATIVE_DIR,
  VENDORED_STAMP,
  VENDORED_STAMP_RELATIVE_DIR,
} from "./vendored-skills"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { pathExists } from "./path-exists"
import { copyNew } from "./copy-new"
import { addCommandsAsSharedSkills, committablePaths } from "./portable-skills"
import { CANONICAL_SKILLS_DIR, syncAgentSkills } from "./skills/sync-agent-skills"
import { defaultExecFile } from "./default-exec-file"
import { AGENTS_REL, refreshGuide, type GuideRefresh } from "./guide/refresh"
import { withFileLock } from "@/lib/os/departments/safety"
import { lockKey } from "@/lib/os/departments/mutations"

/**
 * Add a second starter pack's commands and skills to a company that already
 * exists — "we're a marketing company, and now we also build websites."
 *
 * What is deliberately NOT copied is the pack's definitions/ontology/company.yaml.
 * That file is the company's own identity, filled in during setup; a pack ships
 * an example one only because a brand-new company has nothing there yet.
 * Overwriting it is the one thing this must never do.
 */

const COMMANDS_RELATIVE_DIR = path.join(".claude", "commands")

/** A company that already moved its commands (see portable-skills.ts) holds at least one shared skill. */
async function isPortable(root: string): Promise<boolean> {
  const shared = path.join(root, ...CANONICAL_SKILLS_DIR.split("/"))
  const entries = await readdir(shared, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.isDirectory() && (await pathExists(path.join(shared, entry.name, "SKILL.md")))) return true
  }
  return false
}

/**
 * Every addable pack and whether this company already holds it.
 *
 * Installed-ness comes from `isPackInstalled`, the same check the update button
 * uses — deliberately one detector, not two: this file and vendored-skills.ts
 * asking the same question two ways is how a skill ends up app-owned by one and
 * user-owned by the other.
 */
export async function listPackState(
  rootPath: string,
  packsRoot: string
): Promise<{ id: string; label: string; description: string; installed: boolean }[]> {
  const state = []
  for (const pack of COMPANY_STARTER_PACKS) {
    // "General purpose" is the base skeleton every company already has.
    if (pack.dirName === null) continue
    state.push({
      id: pack.id,
      label: pack.label,
      description: pack.description,
      installed: await isPackInstalled(rootPath, pack.dirName, packsRoot),
    })
  }
  return state
}

type AddPackResult = { ok: true; added: string[]; guide?: GuideRefresh } | { ok: false; message: string }

export async function addCompanyPackImpl(
  agentId: string,
  packId: string,
  packsRoot: string,
  execFn?: ExecFileFn
): Promise<AddPackResult> {
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }
  if (agent.kind !== "command-set") {
    return { ok: false, message: "This kind of folder has no commands to add to" }
  }

  const pack = COMPANY_STARTER_PACKS.find((p) => p.id === packId)
  if (!pack?.dirName) return { ok: false, message: `Unknown pack "${packId}"` }
  const dirName = pack.dirName // the narrowing of pack.dirName does not carry into the locked callback below

  const packRoot = path.join(packsRoot, dirName)
  if (!(await pathExists(packRoot))) {
    return { ok: false, message: `The ${pack.label} pack is missing from this install` }
  }

  // Everything from here touches the company, so it runs under the company's lock: the same one the department
  // writers and the guide actions take (they all key it on the registered rootPath). refreshGuide takes no lock
  // of its own and the commit is a git index write, so two writers at once would put one change under the
  // other's approval and collide on .git/index.lock.
  return withFileLock(lockKey(agent.rootPath), async (): Promise<AddPackResult> => {
    const portable = await isPortable(agent.rootPath)
    const sharedCommands = portable
      ? await addCommandsAsSharedSkills(path.join(packRoot, COMMANDS_RELATIVE_DIR), agent.rootPath)
      : null
    const commands =
      sharedCommands?.added ??
      (await copyNew(path.join(packRoot, COMMANDS_RELATIVE_DIR), path.join(agent.rootPath, COMMANDS_RELATIVE_DIR), () => false))
    // The pack's skills go to the shared folder every agent reads, and Claude Code and Kiro get generated
    // copies. A name the company already holds in `.claude/skills` is theirs and is not added beside it.
    const packSource = await packSkillsSource(packsRoot, dirName)
    const heldByClaude = new Set(await readdir(path.join(agent.rootPath, VENDORED_SKILLS_RELATIVE_DIR)).catch(() => [] as string[]))
    const skills = await copyNew(
      packSource.dir,
      path.join(agent.rootPath, SHARED_SKILLS_RELATIVE_DIR),
      (name) => name === VENDORED_STAMP || heldByClaude.has(name)
    )
    const mirrored = skills.length > 0 ? ((await syncAgentSkills(agent.rootPath).catch(() => null))?.written ?? []) : []

    const written = [
      ...(sharedCommands?.written ?? commands.map((n) => path.join(COMMANDS_RELATIVE_DIR, n))),
      ...skills.map((n) => path.join(SHARED_SKILLS_RELATIVE_DIR, n)),
      ...mirrored,
    ]
    if (written.length === 0) {
      return { ok: false, message: `This company already has everything in the ${pack.label} pack` }
    }

    // Stamp last, and only when every skill landed — same rule as an update: a
    // stamp claiming skills that were skipped marks the user's own files as
    // app-owned, and the next update deletes them. It goes in a folder no agent reads as skills.
    const allSkillsLanded =
      skills.length === (await readdir(packSource.dir).catch(() => [] as string[])).filter((n) => n !== VENDORED_STAMP).length
    if (allSkillsLanded && (await pathExists(packSource.stampPath))) {
      const stamp = path.join(VENDORED_STAMP_RELATIVE_DIR, packStampName(dirName))
      await mkdir(path.join(agent.rootPath, VENDORED_STAMP_RELATIVE_DIR), { recursive: true })
      await cp(packSource.stampPath, path.join(agent.rootPath, stamp))
      written.push(stamp)
    }

    // The pack changes which teams this company holds. Keep an existing operating guide current in the same commit.
    const guide = await refreshGuide(agent.rootPath, { exec: execFn ?? defaultExecFile, packsRoot })
    if (guide.status === "updated") written.push(AGENTS_REL)

    // Path-scoped to exactly what was written. A failed commit is not a failed
    // add — the files are right on disk, and .claude/ is gitignored in some real
    // repos (same call as update-company-skills-impl.ts).
    try {
      // Generated copies can sit in a folder a repo ignores, and git fails the whole commit on one such path.
      const paths = await committablePaths(agent.rootPath, written, execFn ?? defaultExecFile)
      await commitFile(agent.rootPath, paths, `Add the ${pack.label} pack's commands and skills`, execFn)
    } catch {
      // Deliberately ignored, as above.
    }
    return { ok: true, added: [...commands, ...skills], guide }
  })
}
