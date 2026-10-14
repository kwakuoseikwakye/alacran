import { readdir, cp, rm, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import {
  getVendoredSkillsUpdate,
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
import { defaultExecFile } from "./default-exec-file"
import { committablePaths } from "./portable-skills"
import { hashSkillDir, syncAgentSkills } from "./skills/sync-agent-skills"

/** A copy this app generated carries this marker; a folder without it is a hand-placed or vendored original. */
const GENERATED_MARKER = "<!-- generated from .agents/skills/"

export async function updateCompanySkillsImpl(
  agentId: string,
  packsRoot: string,
  execFn?: ExecFileFn
): Promise<{ ok: true; tag: string; skipped: string[] } | { ok: false; message: string }> {
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) {
    return { ok: false, message: "Unknown company" }
  }
  // Same gate as every other company feature (v66): a new capability is off for
  // an `external` folder unless it opts in, and this one writes files.
  if (agent.kind !== "command-set") {
    return { ok: false, message: "This kind of folder has no skills to update" }
  }

  const update = await getVendoredSkillsUpdate(agent.rootPath, packsRoot)
  if (!update) {
    return { ok: false, message: "This company is already up to date" }
  }

  const packSource = await packSkillsSource(packsRoot, update.packDirName)
  const source = packSource.dir
  // The shared folder every agent reads is where the skills live now. A company made before that holds
  // them in `.claude/skills`; those old copies are removed (and regenerated as mirrors) below.
  const target = path.join(agent.rootPath, SHARED_SKILLS_RELATIVE_DIR)
  const legacy = path.join(agent.rootPath, VENDORED_SKILLS_RELATIVE_DIR)
  // A company with no stamp was scaffolded before vendored skills existed, so
  // NOTHING in its skills folders came from this app — every name there is the
  // user's own work, and the bundled names are exactly the ones a marketing
  // company's user picks for their own (copywriting, social, emails, cro…).
  // Overwriting one would break this feature's own promise that skills you
  // wrote are left alone, and an uncommitted one is not recoverable from git.
  // So: skip what we cannot prove we installed, and report it.
  //
  // ponytail: stamp presence is directory-level proof, not per-entry. A stamped
  // company that hand-wrote a skill whose name a LATER upstream tag introduces
  // would still be overwritten. Close that by listing the installed entry names
  // in the stamp if it ever bites — it needs a stamp-format change, not
  // logic here.
  const canReplaceExisting = update.installedTag !== null
  const copied: string[] = []
  const skipped: string[] = []
  const removedLegacy: string[] = []
  const written: string[] = []

  try {
    const all = await readdir(source)
    await mkdir(target, { recursive: true })

    // Replace the vendored entries one by one, NEVER the whole skills directory:
    // the user's own skills live in there too.
    // A skill dropped upstream therefore lingers in the company rather than
    // being deleted — the safe direction, since this code cannot tell an
    // abandoned vendored skill from one the user has come to rely on.
    for (const name of all.filter((n) => n !== VENDORED_STAMP)) {
      const targetEntry = path.join(target, name)
      const legacyEntry = path.join(legacy, name)
      const hasLegacy = await pathExists(legacyEntry)
      if (!canReplaceExisting && ((await pathExists(targetEntry)) || hasLegacy)) {
        skipped.push(name)
        continue
      }
      // Same tag, only the location is changing: the old copy should equal the bundled one. If it does
      // not, someone edited it, and moving would throw that edit away.
      if (
        update.movesLocation &&
        hasLegacy &&
        !(await pathExists(targetEntry)) &&
        (await hashSkillDir(legacyEntry)) !== (await hashSkillDir(path.join(source, name)))
      ) {
        skipped.push(name)
        continue
      }
      await rm(targetEntry, { recursive: true, force: true })
      await cp(path.join(source, name), targetEntry, { recursive: true })
      copied.push(name)
      written.push(path.join(SHARED_SKILLS_RELATIVE_DIR, name))
      // The old app-owned copy sits at the very path its generated mirror will take, so it goes first.
      // One that already carries the generated marker is a mirror, which the sync keeps current (and
      // leaves alone if the user edited it).
      if (hasLegacy) {
        const text = await readFile(path.join(legacyEntry, "SKILL.md"), "utf-8").catch(() => "")
        if (!text.includes(GENERATED_MARKER)) {
          await rm(legacyEntry, { recursive: true, force: true })
          removedLegacy.push(path.join(VENDORED_SKILLS_RELATIVE_DIR, name))
        }
      }
    }

    // Mirrors for Claude Code and Kiro, generated from what was just written. A failure here throws
    // before the stamp, so the update stays retryable.
    const report = await syncAgentSkills(agent.rootPath)
    written.push(...report.written)

    // The stamp goes LAST, and only on a complete install. It is the app's
    // record of what is installed and the button compares nothing else, so
    // writing it early — or writing it after skipping something — strands the
    // company: it claims a version it does not have, the button disappears, and
    // worse, the skipped names become app-owned, so the NEXT update would
    // delete the user's work. Stamp-last also makes a mid-copy throw simply
    // retryable, since the old tag is still what's on disk.
    // Written under this pack's own name (see packStampName), in a folder no agent reads as skills.
    // The legacy stamps are deliberately left where they are: the shared UPSTREAM.md is still the stamp
    // of the pack this company was scaffolded from, and deleting it here would make that pack look
    // unstamped and hand its skills back to the user as editable.
    if (skipped.length === 0 && (await pathExists(packSource.stampPath))) {
      const stamp = path.join(VENDORED_STAMP_RELATIVE_DIR, packStampName(update.packDirName))
      await mkdir(path.join(agent.rootPath, VENDORED_STAMP_RELATIVE_DIR), { recursive: true })
      await rm(path.join(agent.rootPath, stamp), { recursive: true, force: true })
      await cp(packSource.stampPath, path.join(agent.rootPath, stamp))
      written.push(stamp)
    }
  } catch (err) {
    return {
      ok: false,
      message: `Failed to update skills: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Path-scoped to exactly what was written, so a skill the user is midway
  // through writing in the same directory is never swept into this commit.
  // Only paths git will accept: a repo that ignores `.claude/` would otherwise fail the whole commit.
  //
  // A failed commit must not fail the update — the files are already correct on
  // disk (same call as v61's).
  try {
    const paths = await committablePaths(
      agent.rootPath,
      [...new Set([...written, ...removedLegacy])],
      execFn ?? defaultExecFile
    )
    await commitFile(
      agent.rootPath,
      paths,
      `Update ${update.packDirName} skills to ${update.bundledTag} via Alacrán`,
      execFn
    )
  } catch {
    // Intentionally ignored — see above.
  }

  return { ok: true, tag: update.bundledTag, skipped }
}
