import { readdir, cp, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { COMPANY_STARTER_PACKS } from "./company-starter-packs"
import { isPackInstalled, packStampName, VENDORED_SKILLS_RELATIVE_DIR, VENDORED_STAMP } from "./vendored-skills"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { pathExists } from "./path-exists"

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

/** Copy entries that aren't already there; never overwrite the user's own. */
async function copyNew(source: string, target: string, skip: (name: string) => boolean): Promise<string[]> {
  const names = await readdir(source).catch(() => [])
  if (names.length === 0) return []
  await mkdir(target, { recursive: true })
  const copied: string[] = []
  for (const name of names) {
    if (skip(name)) continue
    // A command or skill of this name already in the company is the user's —
    // possibly their own edit of this very file. Adding a pack is additive or
    // it is nothing.
    if (await pathExists(path.join(target, name))) continue
    await cp(path.join(source, name), path.join(target, name), { recursive: true })
    copied.push(name)
  }
  return copied
}

export async function addCompanyPackImpl(
  agentId: string,
  packId: string,
  packsRoot: string,
  execFn?: ExecFileFn
): Promise<{ ok: true; added: string[] } | { ok: false; message: string }> {
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }
  if (agent.kind !== "command-set") {
    return { ok: false, message: "This kind of folder has no commands to add to" }
  }

  const pack = COMPANY_STARTER_PACKS.find((p) => p.id === packId)
  if (!pack?.dirName) return { ok: false, message: `Unknown pack "${packId}"` }

  const packRoot = path.join(packsRoot, pack.dirName)
  if (!(await pathExists(packRoot))) {
    return { ok: false, message: `The ${pack.label} pack is missing from this install` }
  }

  const commands = await copyNew(
    path.join(packRoot, COMMANDS_RELATIVE_DIR),
    path.join(agent.rootPath, COMMANDS_RELATIVE_DIR),
    () => false
  )
  const skills = await copyNew(
    path.join(packRoot, VENDORED_SKILLS_RELATIVE_DIR),
    path.join(agent.rootPath, VENDORED_SKILLS_RELATIVE_DIR),
    (name) => name === VENDORED_STAMP
  )

  const written = [
    ...commands.map((n) => path.join(COMMANDS_RELATIVE_DIR, n)),
    ...skills.map((n) => path.join(VENDORED_SKILLS_RELATIVE_DIR, n)),
  ]
  if (written.length === 0) {
    return { ok: false, message: `This company already has everything in the ${pack.label} pack` }
  }

  // Stamp last, and only when every skill landed — same rule as an update: a
  // stamp claiming skills that were skipped marks the user's own files as
  // app-owned, and the next update deletes them.
  const bundledStamp = path.join(packRoot, VENDORED_SKILLS_RELATIVE_DIR, VENDORED_STAMP)
  const allSkillsLanded =
    skills.length ===
    (await readdir(path.join(packRoot, VENDORED_SKILLS_RELATIVE_DIR)).catch(() => [])).filter(
      (n) => n !== VENDORED_STAMP
    ).length
  if (allSkillsLanded && (await pathExists(bundledStamp))) {
    const stamp = packStampName(pack.dirName)
    await cp(bundledStamp, path.join(agent.rootPath, VENDORED_SKILLS_RELATIVE_DIR, stamp))
    written.push(path.join(VENDORED_SKILLS_RELATIVE_DIR, stamp))
  }

  // Path-scoped to exactly what was written. A failed commit is not a failed
  // add — the files are right on disk, and .claude/ is gitignored in some real
  // repos (same call as update-company-skills-impl.ts).
  try {
    await commitFile(agent.rootPath, written, `Add the ${pack.label} pack's commands and skills`, execFn)
  } catch {
    // Deliberately ignored, as above.
  }
  return { ok: true, added: [...commands, ...skills] }
}
